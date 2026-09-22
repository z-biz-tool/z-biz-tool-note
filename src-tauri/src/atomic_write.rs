use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 原子写入文件：先写到临时文件 → fsync → rename 原子替换。
///
/// 设计目标：崩溃/断电时，目标文件要么保持旧版本，要么已经是完整新版本，
/// 绝不会出现半截文件。
///
/// 实现要点：
/// 1. 临时文件名以 `.` 前缀 + `.tmp` 后缀，避免被目录扫描误识别为用户文件
/// 2. fsync 临时文件 + fsync 父目录，确保 rename 也落盘
/// 3. Unix 上 `rename` 是原子操作，Windows 上需要走 fallback 路径
///
/// Windows 兼容性说明：
/// - Unix: `std::fs::rename` 覆盖同名文件，符合 POSIX 语义
/// - Windows: `std::fs::rename` 不会覆盖已存在文件，因此对 Windows 使用
///   "目标 → 临时 .bak → rename 临时 → 目标" 的迂回方式，确保原子性
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

    let tmp = dir.join(format!(".{}.{}.tmp", file_name, std::process::id()));

    // 1. 写入临时文件
    {
        let mut file = fs::File::create(&tmp)
            .map_err(|e| format!("创建临时文件失败 ({}): {}", tmp.display(), e))?;
        file.write_all(content)
            .map_err(|e| format!("写入临时文件失败 ({}): {}", tmp.display(), e))?;
        file.sync_all()
            .map_err(|e| format!("fsync 临时文件失败 ({}): {}", tmp.display(), e))?;
    }

    // 2. 原子 rename
    //    - Unix: rename 覆盖已存在文件
    //    - Windows: rename 不会覆盖，先把目标备份再 rename，失败再回滚
    #[cfg(windows)]
    {
        // Windows 上 std::fs::rename 不允许覆盖，需要迂回实现
        let bak = dir.join(format!(".{}.{}.bak", file_name, std::process::id()));
        let target_existed = target.exists();
        if target_existed {
            fs::rename(target, &bak)
                .map_err(|e| format!("Windows 备份原文件失败: {}", e))?;
        }
        if let Err(e) = fs::rename(&tmp, target) {
            // 回滚：恢复 bak 到 target
            if target_existed {
                let _ = fs::rename(&bak, target);
            }
            // 清理 tmp
            let _ = fs::remove_file(&tmp);
            return Err(format!("rename 失败: {}", e));
        }
        // 成功：清理 bak
        if target_existed {
            let _ = fs::remove_file(&bak);
        }
    }
    #[cfg(not(windows))]
    {
        fs::rename(&tmp, target)
            .map_err(|e| format!("rename 失败 ({} → {}): {}", tmp.display(), target_str, e))?;
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
    Ok(dir.join(format!(".{}.{}.{}", file_name, std::process::id(), suffix)))
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
}