use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// 同进程内并发写**同一个**目标文件时，临时文件名必须互不相同。
///
/// 原来临时名只带 pid：同一进程里两次写同一个文件（例如自动保存与手动保存撞在一起）
/// 会共用同一个临时文件 —— 后一次的 `File::create` 把前一次已写好的内容截断，
/// 前一次 rename 走掉的是**后一次**的内容，后一次再 rename 则报 ENOENT。
/// 结果是「落盘内容与调用方预期不符」＋「后一次保存被当成失败」。
/// 加上自增序号后每次调用独占一个临时文件，并发写不会互相踩。
static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// 原子写入文件：先写到临时文件 → fsync → rename 原子替换。
///
/// 设计目标：崩溃/断电时，目标文件要么保持旧版本，要么已经是完整新版本，
/// 绝不会出现半截文件。
///
/// 实现要点：
/// 1. 临时文件名以 `.` 前缀 + `.tmp` 后缀，避免被目录扫描误识别为用户文件
/// 2. fsync 临时文件 + fsync 父目录，确保 rename 也落盘
///
/// ## Windows：一条 rename 就够，不需要「备份再迂回」
///
/// 旧实现里有一句注释「Windows 上 `std::fs::rename` 不会覆盖已存在文件」，
/// 并据此在 Windows 上套了一套「目标 → 临时 .bak → rename 临时 → 目标」的迂回。
///
/// **那句注释是错的。** Rust 标准库文档（`std::fs::rename`）明写：
///
/// > Renames a file or directory to a new name, **replacing the original file
/// > if `to` already exists.**
///
/// Windows 侧对应 `MoveFileExW`（回退到 `SetFileInformationByHandle`），
/// **本来就会覆盖已存在的文件**；并且「`to` 不能是目录」。
///
/// 那套迂回逻辑自身带来两个 Windows 专属缺陷（2026-10-20 由 Windows CI 抓出）：
///
/// 1. **会毁掉目录**：目标是个**已存在的目录**时，
///    `rename(目录 → .bak)` 在 Windows 上**是成功的**（Windows 允许改目录名），
///    于是用户的目录被**改名搬走**，接着 `remove_file(.bak)` 删不掉目录（那不是文件）
///    ⇒ 目录消失、只剩一个 `.xxx.bak` 垃圾；而且整个调用**返回成功**。
///    正确行为应是「rename(file → 目录) 失败并回传错误」。
/// 2. **并发写同一目标会失败**：A 把 target 搬去 .bak 之后，
///    B 看到 `target.exists()` 为 false ⇒ B 直接 rename 成功 ⇒
///    A 再 rename 时目标已存在 ⇒ 失败 ⇒ 「保存偶发失败」。
///    而这套迂回存在的唯一理由就是那个错误的注释。
///
/// ⇒ 现在各平台统一走 `fs::rename(tmp, target)`：
/// 覆盖已有文件 ✓、目标是目录时失败并回传 ✓、并发写互不干扰 ✓、无 .bak 残留 ✓。
pub fn atomic_write(target: &Path, content: &[u8]) -> Result<(), String> {
    let target_str = target.to_string_lossy().to_string();
    let dir = target
        .parent()
        .ok_or_else(|| format!("写入失败：路径无父目录: {}", target_str))?;

    let file_name = target
        .file_name()
        .ok_or_else(|| format!("写入失败：路径无文件名: {}", target_str))?
        .to_string_lossy()
        .to_string();

    let tmp = temp_path_for(dir, &file_name, "tmp");

    // 1. 写入临时文件
    //    任何一步失败都要把临时文件清掉：临时文件就落在用户笔记目录里，
    //    留着就是一个既不是笔记、又被文件树/搜索忽略的垃圾文件（用户看不见也删不掉）。
    {
        let mut file = match fs::File::create(&tmp) {
            Ok(f) => f,
            Err(e) => {
                let _ = fs::remove_file(&tmp);
                return Err(format!("创建临时文件失败 ({}): {}", tmp.display(), e));
            }
        };
        if let Err(e) = file.write_all(content) {
            let _ = fs::remove_file(&tmp);
            return Err(format!("写入临时文件失败 ({}): {}", tmp.display(), e));
        }
        if let Err(e) = file.sync_all() {
            let _ = fs::remove_file(&tmp);
            return Err(format!("fsync 临时文件失败 ({}): {}", tmp.display(), e));
        }
    }

    // 2. 原子 rename（各平台同一条）
    //    Rust 的 std::fs::rename 在 Windows 上也会覆盖已存在的文件
    //    （MoveFileExW / SetFileInformationByHandle，见函数头注释与 std 文档），
    //    且「to 不能是目录」⇒ 目标是个目录时必然失败 —— 正是失败路径要的行为。
    if let Err(e) = fs::rename(&tmp, target) {
        // rename 失败：临时文件不能留在用户目录里
        let _ = fs::remove_file(&tmp);
        return Err(format!(
            "rename 失败 ({} → {}): {}",
            tmp.display(),
            target_str,
            e
        ));
    }

    // 3. fsync 父目录，确保 rename 也落盘
    //    在 Windows 上无法 fsync 目录，跳过；macOS / Linux 上尽量尝试
    #[cfg(not(windows))]
    {
        if let Ok(dir_file) = fs::File::open(dir) {
            let _ = dir_file.sync_all();
        }
    }

    Ok(())
}

/// 原子写入字符串便捷封装
pub fn atomic_write_str(target: &Path, content: &str) -> Result<(), String> {
    atomic_write(target, content.as_bytes())
}

/// 原子复制文件（先读后原子写）
#[allow(dead_code)]
pub fn atomic_copy(src: &Path, dest: &Path) -> Result<(), String> {
    let bytes = fs::read(src).map_err(|e| format!("读取源文件失败: {}", e))?;
    atomic_write(dest, &bytes)
}

/// 生成同目录下的临时文件路径：`.{原名}.{pid}.{自增序号}.{后缀}`
///
/// 自增序号保证**同一次进程内**的每次调用都拿到不同的路径。
/// 只带 pid 是不够的：自动保存与手动保存同时落在同一篇笔记上时，
/// 两次写会共用同一个临时文件而互相截断（详见 TMP_COUNTER 的注释）。
fn temp_path_for(dir: &Path, file_name: &str, suffix: &str) -> PathBuf {
    dir.join(format!(
        ".{}.{}.{}.{}",
        file_name,
        std::process::id(),
        TMP_COUNTER.fetch_add(1, Ordering::SeqCst),
        suffix
    ))
}

/// 为指定文件生成安全的临时文件名（避免冲突，便于故障排查保留现场）
#[allow(dead_code)]
pub fn temp_sibling(target: &Path, suffix: &str) -> Result<PathBuf, String> {
    let dir = target
        .parent()
        .ok_or_else(|| format!("临时文件路径无父目录: {}", target.display()))?;
    let file_name = target
        .file_name()
        .ok_or_else(|| format!("临时文件路径无文件名: {}", target.display()))?
        .to_string_lossy()
        .to_string();
    Ok(temp_path_for(dir, &file_name, suffix))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn tempdir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let counter = COUNTER.fetch_add(1, Ordering::SeqCst);
        let mut p = std::env::temp_dir();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        p.push(format!(
            "zennote-atomic-test-{}-{}-{}",
            std::process::id(),
            nanos,
            counter
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn write_creates_file_with_content() {
        let dir = tempdir();
        let target = dir.join("note.md");
        atomic_write_str(&target, "hello world").unwrap();
        let read = fs::read_to_string(&target).unwrap();
        assert_eq!(read, "hello world");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn overwrite_existing_file() {
        let dir = tempdir();
        let target = dir.join("note.md");
        fs::write(&target, "old").unwrap();
        atomic_write_str(&target, "new").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "new");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_content() {
        let dir = tempdir();
        let target = dir.join("empty.md");
        fs::write(&target, "placeholder").unwrap();
        atomic_write_str(&target, "").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unicode_content_round_trip() {
        let dir = tempdir();
        let target = dir.join("cn.md");
        let content = "# 中文标题\n\n- 项目\n- 计划 #工作";
        atomic_write_str(&target, content).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), content);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_tmp_files_left_behind() {
        let dir = tempdir();
        let target = dir.join("clean.md");
        atomic_write_str(&target, "x").unwrap();
        // 检查没有遗留临时文件
        let mut found_tmp = 0;
        for entry in fs::read_dir(&dir).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.contains(".tmp") || name.contains(".bak") {
                found_tmp += 1;
            }
        }
        assert_eq!(found_tmp, 0, "不应残留临时文件");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bulk_writes_dont_collide() {
        let dir = tempdir();
        let mut paths = HashMap::new();
        for i in 0..50 {
            let p = dir.join(format!("note_{}.md", i));
            atomic_write_str(&p, &format!("content-{}", i)).unwrap();
            paths.insert(p.to_string_lossy().to_string(), format!("content-{}", i));
        }
        for (path, expected) in &paths {
            assert_eq!(&fs::read_to_string(path).unwrap(), expected);
        }
        let _ = fs::remove_dir_all(&dir);
    }

    /* ────────────── 并发写同一个目标文件（临时文件必须互不相同） ────────────── */

    #[test]
    fn temp_path_is_unique_per_call() {
        let dir = tempdir();
        let a = temp_path_for(&dir, "note.md", "tmp");
        let b = temp_path_for(&dir, "note.md", "tmp");
        assert_ne!(a, b, "同一次进程内的两次写不能共用同一个临时文件");
        assert_eq!(a.parent().unwrap(), dir);
        assert!(a
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with(".note.md."));
        assert!(a.to_string_lossy().ends_with(".tmp"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn concurrent_writes_to_same_target_all_succeed() {
        // 回归：临时名只带 pid 时，并发写同一个文件会共用一个临时文件 ——
        // 后写的把先写的截断，先写的 rename 走掉的是后写的内容，后写的再 rename 报 ENOENT。
        // 症状是「保存偶发失败」＋「落盘内容不是自己写的那份」。
        let dir = tempdir();
        let target = dir.join("note.md");
        atomic_write_str(&target, "seed").unwrap();

        let handles: Vec<_> = (0..8)
            .map(|i| {
                let target = target.clone();
                std::thread::spawn(move || atomic_write_str(&target, &format!("content-{}", i)))
            })
            .collect();
        for h in handles {
            h.join().unwrap().expect("并发写不应报错");
        }

        let final_content = fs::read_to_string(&target).unwrap();
        assert!(
            (0..8).any(|i| final_content == format!("content-{}", i)),
            "落盘内容必须是某一次写入的完整内容，实际: {:?}",
            final_content
        );
        assert_eq!(count_temp_files(&dir), 0, "并发写不应残留临时文件");
        let _ = fs::remove_dir_all(&dir);
    }

    /* ────────────── 失败路径：临时文件必须清掉，错误必须回传 ────────────── */

    #[test]
    fn failed_rename_cleans_up_temp_file() {
        // 目标是一个已存在的目录 → rename(file → dir) 必然失败（EISDIR/ENOTDIR）。
        // 这条路径上旧实现会把临时文件留在用户目录里。
        let dir = tempdir();
        let target = dir.join("target_is_dir");
        fs::create_dir_all(&target).unwrap();

        let err = atomic_write_str(&target, "payload").unwrap_err();
        assert!(!err.is_empty(), "失败必须回传错误信息");
        assert!(
            err.contains("rename"),
            "错误信息应说明是 rename 失败，实际: {}",
            err
        );

        assert_eq!(count_temp_files(&dir), 0, "失败后不应残留临时文件");
        assert!(target.is_dir(), "目标目录不该被破坏");
        let _ = fs::remove_dir_all(&dir);
    }

    /// 回归钉：目标是**已存在的目录**时，写入必须失败，**且目录必须原地不动**。
    ///
    /// 2026-10-20 由 Windows CI 抓出：旧实现以为「Windows 的 rename 不覆盖」
    /// （这句是错的，std 文档明写 rename 会替换已存在的文件），于是套了
    /// 「目标 → .bak → rename 临时 → 目标」的迂回。
    /// 而 Windows **允许给目录改名** ⇒ `rename(目录 → .bak)` 成功 ⇒
    /// 用户的目录被**改名搬走**，随后 `remove_file(.bak)` 删不掉目录（那不是文件）
    /// ⇒ **目录消失、只剩一个 `.xxx.bak` 垃圾，而且整个调用还返回成功**。
    ///
    /// 这条测试在**所有平台**都跑：Unix 上 rename(file → dir) 本来就失败，
    /// 断言「目录仍在原处、旁边没有 .bak」把两边都钉住。
    #[test]
    fn writing_over_a_directory_fails_and_leaves_the_directory_intact() {
        let dir = tempdir();
        let target = dir.join("a_directory");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("inside.txt"), "keep me").unwrap();

        let err = atomic_write_str(&target, "payload").expect_err("写目录必须失败");

        assert!(!err.is_empty(), "必须回传错误");
        // 目录必须还在原处、还是目录、内容没被动过
        assert!(target.is_dir(), "目录不能被改名搬走：{}", err);
        assert!(target.join("inside.txt").exists(), "目录里的内容不能被动过");
        // 目录旁边不能留下改名后的残骸
        let siblings: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            !siblings.iter().any(|n| n.contains(".bak")),
            "不该留下 .bak 残骸，实际目录内容: {:?}",
            siblings
        );
        assert_eq!(siblings.len(), 1, "目录里只应有那一个目录：{:?}", siblings);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_write_to_missing_dir_reports_error() {
        let dir = tempdir();
        let target = dir.join("no_such_dir").join("note.md");
        let err = atomic_write_str(&target, "payload").unwrap_err();
        assert!(err.contains("创建临时文件失败"), "实际: {}", err);
        assert!(!target.exists(), "失败时不该留下半截文件");
        let _ = fs::remove_dir_all(&dir);
    }

    /* ────────────── T1-02 看门狗：src/ 下不许再有裸写盘调用 ────────────── */

    /// 递归收集目录下所有 .rs 文件
    fn collect_rs_files(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        let mut stack = vec![dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            let Ok(entries) = fs::read_dir(&d) else {
                continue;
            };
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    stack.push(p);
                } else if p.extension().and_then(|e| e.to_str()) == Some("rs") {
                    out.push(p);
                }
            }
        }
        out.sort();
        out
    }

    /// 去掉注释后的代码行（字符串字面量里的 `//` 不算注释起点）
    fn code_lines(content: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut in_block_comment = false;
        for line in content.lines() {
            let bytes = line.as_bytes();
            let mut code = String::new();
            let mut quote: Option<u8> = None;
            let mut i = 0;
            while i < bytes.len() {
                if in_block_comment {
                    if bytes[i] == b'*' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
                        in_block_comment = false;
                        i += 2;
                    } else {
                        i += 1;
                    }
                    continue;
                }
                let c = bytes[i];
                match quote {
                    Some(q) => {
                        if c == b'\\' {
                            code.push(c as char);
                            if i + 1 < bytes.len() {
                                code.push(bytes[i + 1] as char);
                                i += 2;
                                continue;
                            }
                        } else {
                            code.push(c as char);
                            if c == q {
                                quote = None;
                            }
                        }
                        i += 1;
                    }
                    None => {
                        if c == b'"' || c == b'\'' {
                            quote = Some(c);
                            code.push(c as char);
                            i += 1;
                        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
                            break; // 行注释，剩余丢弃
                        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
                            in_block_comment = true;
                            i += 2;
                        } else {
                            code.push(c as char);
                            i += 1;
                        }
                    }
                }
            }
            out.push(code);
        }
        out
    }

    #[test]
    fn no_bare_fs_write_outside_atomic_write() {
        // Why: 「所有写入点都走原子写」是一次性改造，代码会继续长。
        // 没有这条钉子，下一个人写一句 `fs::write(&path, &content)` 就把断电保护悄悄拆了，
        // 而功能测试完全看不出来（文件照样写成功了，只是可能写坏一半）。
        let src_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut violations: Vec<String> = Vec::new();
        for file in collect_rs_files(&src_dir) {
            if file.file_name().and_then(|n| n.to_str()) == Some("atomic_write.rs") {
                continue; // 本模块自身就是原子写的实现
            }
            let content = fs::read_to_string(&file).unwrap();
            for (idx, code) in code_lines(&content).into_iter().enumerate() {
                for pat in ["fs::write(", "File::create("] {
                    if code.contains(pat) {
                        violations.push(format!(
                            "{}:{}: 出现裸写盘调用 `{}`，请改用 atomic_write / atomic_write_str",
                            file.display(),
                            idx + 1,
                            pat
                        ));
                    }
                }
            }
        }
        assert!(
            violations.is_empty(),
            "以下写入点绕过了原子写：\n{}",
            violations.join("\n")
        );
    }

    /// 目录里残留的临时文件（.tmp / .bak）个数
    fn count_temp_files(dir: &Path) -> usize {
        fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        name.contains(".tmp") || name.contains(".bak")
                    })
                    .count()
            })
            .unwrap_or(0)
    }
}
