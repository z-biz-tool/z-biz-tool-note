//! 敏感项（AI API Key 等）的 OS 密钥库存取。
//!
//! 背景（迁移前的真实存储位置）：`ai.apiKey` 曾以明文 JSON 存在前端
//! localStorage 的 `aiConfig` 键里（src/App.tsx 写入/读出），任何能读 WebView
//! 存储的代码都能拿到。本模块把明文收进 OS 密钥库 —— macOS Keychain /
//! Windows Credential Manager / Linux Secret Service，由 `keyring` crate
//! 按平台自动选择。
//!
//! 命名规范（与前端 src/lib/aiSecrets.ts 的 AI_APIKEY_ACCOUNT 对齐）：
//! - service = "z-biz-tool-note"（应用级；测试一律用 "z-biz-tool-note-test"，
//!   与真实条目物理隔离，CI 误跑也不污染用户凭据）；
//! - account = 命名空间化 key，如 "ai.apiKey"、"ai.provider.<name>.key"。
//!
//! PlainSecret 参考 db 仓（z-biz-tool-db/src-tauri/src/secrets.rs）的 drop
//! 清零模式：底层用 `Arc<Mutex<Vec<u8>>>` 而不是裸 `Vec<u8>`，这样测试可以
//! 额外持有一个观察句柄，在 PlainSecret 被 drop 之后**验证**字节确实被清零
//! （裸 Vec 在 drop 之后观察不到，无法证伪）。

use std::sync::{Arc, Mutex};

use keyring::Entry;

/// 生产环境写入 OS 密钥库时使用的 service 名。
pub const KEYCHAIN_SERVICE: &str = "z-biz-tool-note";

/// 测试专用 service 名：与真实 service 物理隔离。
///
/// 标 `#[cfg(test)]`：这是**测试钩子**，不该出现在发布版的公开 API 里
/// （参照 db 仓 secrets.rs 对 install_secret_store_for_test 的处理）。
#[cfg(test)]
pub const TEST_KEYCHAIN_SERVICE: &str = "z-biz-tool-note-test";

/// 当前进程内可见的明文 secret；最后一个持有者被 drop 时字节被清零。
///
/// 与 db 仓同名类型同构（Arc<Mutex<Vec<u8>>> + Drop 清零），仅注释说明
/// 本仓的用途，避免两个仓之间靠"复制时忘了改注释"维护。
pub struct PlainSecret {
    bytes: Arc<Mutex<Vec<u8>>>,
}

impl PlainSecret {
    pub fn new(s: impl Into<Vec<u8>>) -> Self {
        Self {
            bytes: Arc::new(Mutex::new(s.into())),
        }
    }

    /// 取明文快照（副本）。调用方负责用完即弃。
    pub fn expose(&self) -> Vec<u8> {
        self.bytes.lock().map(|b| b.clone()).unwrap_or_default()
    }

    /// UTF-8 解码；非 UTF-8 按替换字符处理（密钥都是 ASCII，走到这说明数据已损坏）。
    pub fn as_str(&self) -> String {
        String::from_utf8_lossy(&self.expose()).into_owned()
    }

    /// 显式清零（不等 drop）。
    pub fn zero(&self) {
        if let Ok(mut b) = self.bytes.lock() {
            b.iter_mut().for_each(|x| *x = 0);
        }
    }

    /// 当前字节是否已全零（自检 / 测试用）。
    ///
    /// 标 `#[cfg(test)]`：生产路径只写不清零校验，读的是 keychain 返回值；
    /// 清零的正确性由测试用观察句柄钉住（见 tests）。
    #[cfg(test)]
    pub fn is_zeroed(&self) -> bool {
        self.bytes
            .lock()
            .map(|b| b.iter().all(|&x| x == 0))
            .unwrap_or(true)
    }
}

impl Drop for PlainSecret {
    fn drop(&mut self) {
        // 用 0 覆盖以减少剩余明文窗口
        self.zero();
    }
}

/// 把命名空间化 key 规范化成 keychain account。
///
/// 规范：2~4 段，以 `.` 分隔；每段只允许 `[A-Za-z0-9_-]`，非空。
/// 例："ai.apiKey"（2 段）、"ai.provider.deepseek.key"（4 段）。
/// 拒绝空串、无命名空间的裸名（"apiKey"）、空段（"ai..apiKey"）、
/// 分隔符变体（"ai/apiKey"）——这些会让 account 失去命名空间隔离，
/// 在系统密钥库里和别的应用撞车。
pub fn account_for(key: &str) -> Result<String, String> {
    let segments: Vec<&str> = key.split('.').collect();
    if !(2..=4).contains(&segments.len()) {
        return Err(format!(
            "密钥 key 必须是 2~4 段命名空间（如 ai.apiKey）: {:?}",
            key
        ));
    }
    for seg in &segments {
        if seg.is_empty()
            || !seg
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!(
                "密钥 key 含非法段 {:?}（每段只允许字母/数字/-/_）: {:?}",
                seg, key
            ));
        }
    }
    Ok(key.to_string())
}

fn entry_for(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account)
        .map_err(|e| format!("创建密钥库条目失败（service={}）: {}", service, e))
}

/// 探测密钥库是否真的可用：读一个**不存在**的条目，不会创建、不弹窗、
/// 不碰真实数据。测试据此决定优雅跳过还是真跑 roundtrip。
///
/// 标 `#[cfg(test)]`：生产路径不需要探测（命令失败会把错误带回前端），
/// 这只是测试的可用性门。
#[cfg(test)]
pub fn check_available(service: &str) -> Result<(), String> {
    // 探测用的假 account（只读不存在的条目，不会创建任何东西）
    const AVAILABILITY_PROBE_ACCOUNT: &str = "__availability_probe__";
    let probe = entry_for(service, AVAILABILITY_PROBE_ACCOUNT)?;
    match probe.get_secret() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("密钥库不可访问: {}", e)),
    }
}

/// 写密钥（覆盖写）。value 为空由调用方先走 delete，这里直接拒绝。
pub fn save_secret_in(service: &str, key: &str, value: &str) -> Result<(), String> {
    let account = account_for(key)?;
    let entry = entry_for(service, &account)?;
    entry
        .set_secret(value.as_bytes())
        .map_err(|e| format!("写入密钥库失败（account={}）: {}", account, e))
}

/// 读密钥。`Ok(None)` = 条目不存在（还没配过密钥），与"读失败"区分开。
///
/// 返回 PlainSecret 而不是裸 String：明文在内存里的最后一站，drop 即清零
/// （与 db 仓同名类型同一模式）；命令层再 `.as_str()` 成 String 过 IPC。
pub fn load_secret_in(service: &str, key: &str) -> Result<Option<PlainSecret>, String> {
    let account = account_for(key)?;
    let entry = entry_for(service, &account)?;
    match entry.get_secret() {
        Ok(bytes) => Ok(Some(PlainSecret::new(bytes))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("读取密钥库失败（account={}）: {}", account, e)),
    }
}

/// 删密钥。幂等：条目本来不存在也算成功（前端"清空输入框"和"从没配过"
/// 走同一条保存路径，不该因为不存在就报错）。
pub fn delete_secret_in(service: &str, key: &str) -> Result<(), String> {
    let account = account_for(key)?;
    let entry = entry_for(service, &account)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("删除密钥库条目失败（account={}）: {}", account, e)),
    }
}

/* ───────────────────────── Tauri 命令（前端 invoke 入口） ───────────────────────── */

/// 保存密钥到 OS 密钥库。account = 命名空间化 key（"ai.apiKey" 等）。
#[tauri::command]
pub fn save_secret(key: String, value: String) -> Result<(), String> {
    if value.is_empty() {
        // 空值不是"保存了一个空密钥"：前端清空输入框时应调 delete_secret。
        // 这里拒绝，避免用户以为自己"存了个空串"却其实留着旧值。
        return Err("密钥值不能为空：清除密钥请使用 delete_secret".to_string());
    }
    save_secret_in(KEYCHAIN_SERVICE, &key, &value)
}

/// 从 OS 密钥库读密钥；没配过返回 null（前端据此显示空输入框）。
#[tauri::command]
pub fn load_secret(key: String) -> Result<Option<String>, String> {
    Ok(load_secret_in(KEYCHAIN_SERVICE, &key)?.map(|s| s.as_str()))
}

/// 从 OS 密钥库删除密钥（幂等）。
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    delete_secret_in(KEYCHAIN_SERVICE, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// keychain 不可用时优雅跳过：打印 skip 原因，**不算失败**。
    fn keychain_or_skip() -> Option<()> {
        match check_available(TEST_KEYCHAIN_SERVICE) {
            Ok(()) => Some(()),
            Err(e) => {
                eprintln!("[skip] keychain 后端不可用，跳过 OS 密钥库实测: {}", e);
                None
            }
        }
    }

    /* ───────────────────────── 命名规范（不碰 keychain） ───────────────────────── */

    #[test]
    fn account_for_accepts_namespaced_keys() {
        assert_eq!(account_for("ai.apiKey").unwrap(), "ai.apiKey");
        assert_eq!(
            account_for("ai.provider.deepseek.key").unwrap(),
            "ai.provider.deepseek.key"
        );
        // 段内允许 - 与 _（provider 名、大小写混排都真实存在）
        assert!(account_for("ai.provider.zhipu-glm.key").is_ok());
    }

    #[test]
    fn account_for_rejects_bad_shapes() {
        // 空串 / 裸名（无命名空间）/ 空段 / 分隔符变体 / 超长段数
        assert!(account_for("").is_err());
        assert!(account_for("apiKey").is_err(), "裸名没有命名空间隔离");
        assert!(account_for("ai..apiKey").is_err());
        assert!(account_for("ai/apiKey").is_err());
        assert!(account_for("ai..").is_err());
        assert!(account_for("a.b.c.d.e").is_err());
        // 空白不是合法字符：不然 account 在密钥库里显示成不可见名字
        assert!(account_for("ai. apiKey").is_err());
    }

    /* ───────────────────────── PlainSecret 清零 ───────────────────────── */

    /// drop 之后字节确实被清零 —— 用观察句柄证明，不是"相信注释"。
    #[test]
    fn plain_secret_zeroed_on_drop() {
        let p = PlainSecret::new(vec![0xAAu8; 16]);
        let observer = Arc::clone(&p.bytes);
        assert!(!p.is_zeroed());
        drop(p);
        let guard = observer.lock().expect("observer lock");
        assert!(
            guard.iter().all(|&b| b == 0),
            "drop 后明文必须被清零，实际残留: {:?}",
            guard
        );
    }

    /// 显式 zero() 与 drop 走同一条清零路径。
    #[test]
    fn plain_secret_explicit_zero() {
        let p = PlainSecret::new("sk-unit-test");
        assert_eq!(p.as_str(), "sk-unit-test");
        p.zero();
        assert!(p.is_zeroed());
    }

    /* ───────────────────────── 命令层参数校验（不碰 keychain） ───────────────────────── */

    #[test]
    fn save_secret_command_rejects_empty_value() {
        let err = save_secret("ai.apiKey".to_string(), String::new())
            .expect_err("空值必须被拒绝，否则用户以为存了空串其实留着旧值");
        assert!(err.contains("delete_secret"), "错误信息要指路: {}", err);
    }

    #[test]
    fn commands_reject_bad_account_shape() {
        assert!(save_secret("apiKey".to_string(), "sk-x".to_string()).is_err());
        assert!(load_secret("apiKey".to_string()).is_err());
        assert!(delete_secret("ai..apiKey".to_string()).is_err());
    }

    /* ───────────────────────── OS 密钥库 roundtrip（不可用则跳过） ───────────────────────── */

    /// save / load / delete 走后端 roundtrip。用测试专用 service，
    /// 测后清理条目，绝不碰真实 "z-biz-tool-note"。
    #[test]
    fn save_load_delete_roundtrip_on_keychain() {
        let Some(()) = keychain_or_skip() else {
            return;
        };
        let account = "ai.provider.unittest.key";
        save_secret_in(TEST_KEYCHAIN_SERVICE, account, "sk-roundtrip").expect("save");

        let got = load_secret_in(TEST_KEYCHAIN_SERVICE, account).expect("load");
        assert_eq!(got.map(|s| s.as_str()), Some("sk-roundtrip".to_string()));

        delete_secret_in(TEST_KEYCHAIN_SERVICE, account).expect("delete");
        let after = load_secret_in(TEST_KEYCHAIN_SERVICE, account).expect("load after delete");
        assert!(after.is_none(), "删除后必须取不到");

        // 删除幂等：再删一次必须还是成功（前端"从没配过"也走同一条路）
        delete_secret_in(TEST_KEYCHAIN_SERVICE, account).expect("delete 幂等");
    }

    /// 不存在的条目是 Ok(None)（"没配过密钥"），不是 Err。
    #[test]
    fn load_missing_entry_is_ok_none() {
        let Some(()) = keychain_or_skip() else {
            return;
        };
        let got = load_secret_in(TEST_KEYCHAIN_SERVICE, "ai.apiKey").expect("load missing");
        assert!(got.is_none());
    }
}
