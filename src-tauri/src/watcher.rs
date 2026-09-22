//! 文件系统监听（替代 App.tsx 中的 5 秒 mtime 轮询）
//!
//! 依赖：notify crate
//!   - macOS: FSEvents
//!   - Linux: inotify
//!   - Windows: ReadDirectoryChangesW
//!
//! 工作模式：每个被打开的目录启动一个后台 watcher。
//! 事件经 500ms debounce 后通过 Tauri event 推送给前端：
//!   - zennote://file-changed  { path }
//!   - zennote://file-created  { path }
//!   - zennote://file-removed  { path }
//!
//! 设计要点：
//!   - 事件风暴防护：相邻 500ms 内同 path 的事件只保留最后一个
//!   - 不在前端做合并，事件源头合并一次更省 IPC 流量
//!   - 监听目录跟随用户切换笔记库自动重建
//!   - 后台 flush 线程使用 AtomicBool shutdown 标志，旧线程在 watch/unwatch 时退出
//!
//! 局限：
//!   - macOS 沙箱模式下可能需要授权；Tauri 2 默认 fs scope 已涵盖主目录

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// 事件防抖窗口
const DEBOUNCE_MS: u64 = 500;

/// 全局 watcher 句柄（tauri::State 注入）
pub struct WatcherState {
    /// 当前正在监听的目录（None = 未启动）
    current_dir: Arc<Mutex<Option<PathBuf>>>,
    /// notify watcher（持有它才能持续监听）
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    /// 待推送事件缓冲：path -> 事件类型 + 上次时间
    pending: Arc<Mutex<HashMap<PathBuf, PendingEvent>>>,
    /// 关闭标志：true 时让所有后台 flush 线程退出循环
    shutdown: Arc<AtomicBool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum EventKindLabel {
    Created,
    Modified,
    Removed,
}

struct PendingEvent {
    kind: EventKindLabel,
    last_seen: Instant,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            current_dir: Arc::new(Mutex::new(None)),
            watcher: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 启动对指定目录的监听（旧 watcher 自动 drop 取消监听）
    pub fn watch(&self, dir: PathBuf, app: AppHandle) -> Result<(), String> {
        if !dir.exists() {
            return Err(format!("监听目录不存在: {}", dir.display()));
        }

        // 1. 标记关闭 → 让上一轮 flush 线程在下次循环检测时退出
        self.shutdown.store(true, Ordering::SeqCst);
        // 等一个 debounce 周期确保旧线程看到标志
        std::thread::sleep(Duration::from_millis(DEBOUNCE_MS + 50));

        // 2. 重置 shutdown 标志（新线程使用）
        self.shutdown.store(false, Ordering::SeqCst);

        // 3. 取出 pending 缓冲 + app handle，移入回调
        let pending = Arc::clone(&self.pending);

        // 4. 创建 notify watcher
        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                let label = match event.kind {
                    EventKind::Create(_) => EventKindLabel::Created,
                    EventKind::Remove(_) => EventKindLabel::Removed,
                    EventKind::Modify(_) => EventKindLabel::Modified,
                    _ => return,
                };

                for path in event.paths {
                    let name = match path.file_name().and_then(|n| n.to_str()) {
                        Some(n) => n,
                        None => continue,
                    };
                    if name.starts_with('.') || name.ends_with(".tmp") || name.ends_with(".swp") {
                        continue;
                    }
                    let mut map = pending.lock();
                    map.insert(
                        path.clone(),
                        PendingEvent {
                            kind: label.clone(),
                            last_seen: Instant::now(),
                        },
                    );
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .map_err(|e| format!("创建 watcher 失败: {}", e))?;

        // 5. 启动监听
        watcher
            .watch(&dir, RecursiveMode::Recursive)
            .map_err(|e| format!("启动监听失败: {}", e))?;

        // 6. 替换旧 watcher（drop 旧的）
        let mut watcher_guard = self.watcher.lock();
        *watcher_guard = Some(watcher);
        drop(watcher_guard);
        *self.current_dir.lock() = Some(dir);

        // 7. 清空 pending（避免旧事件污染新会话）
        self.pending.lock().clear();

        // 8. 启动后台 flush 线程：每 500ms 检查 pending，debounce 后推送
        let shutdown = Arc::clone(&self.shutdown);
        spawn_flush_thread(Arc::clone(&self.pending), app, shutdown);

        Ok(())
    }

    /// 停止当前监听
    pub fn unwatch(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        *self.watcher.lock() = None;
        *self.current_dir.lock() = None;
        self.pending.lock().clear();
    }

    /// 当前监听目录
    #[allow(dead_code)]
    pub fn current_dir(&self) -> Option<PathBuf> {
        self.current_dir.lock().clone()
    }
}

impl Drop for WatcherState {
    fn drop(&mut self) {
        // 应用退出时让所有后台线程退出
        self.shutdown.store(true, Ordering::SeqCst);
    }
}

/// 后台线程：每 500ms 检查 pending 表，debounce 后推送事件给前端。
/// shutdown 标志为 true 时退出循环（防止切换目录时线程泄漏）。
fn spawn_flush_thread(
    pending: Arc<Mutex<HashMap<PathBuf, PendingEvent>>>,
    app: AppHandle,
    shutdown: Arc<AtomicBool>,
) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(DEBOUNCE_MS));
        if shutdown.load(Ordering::SeqCst) {
            break;
        }

        let now = Instant::now();
        let to_emit: Vec<(PathBuf, EventKindLabel)> = {
            let mut map = pending.lock();
            let mut out = Vec::new();
            let stale_paths: Vec<PathBuf> = map
                .iter()
                .filter(|(_, p)| now.duration_since(p.last_seen) >= Duration::from_millis(DEBOUNCE_MS))
                .map(|(k, _)| k.clone())
                .collect();
            for path in stale_paths {
                if let Some(p) = map.remove(&path) {
                    out.push((path, p.kind));
                }
            }
            out
        };

        for (path, kind) in to_emit {
            let path_str = path.to_string_lossy().to_string();
            let event_name = match kind {
                EventKindLabel::Created => "zennote://file-created",
                EventKindLabel::Removed => "zennote://file-removed",
                EventKindLabel::Modified => "zennote://file-changed",
            };
            let _ = app.emit(event_name, serde_json::json!({ "path": path_str }));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_kind_label_eq() {
        assert_eq!(EventKindLabel::Created, EventKindLabel::Created);
        assert_ne!(EventKindLabel::Created, EventKindLabel::Modified);
    }

    #[test]
    fn state_default_unwatched() {
        let s = WatcherState::new();
        assert!(s.current_dir().is_none());
        assert!(!s.shutdown.load(Ordering::SeqCst));
    }

    #[test]
    fn shutdown_flag_can_be_toggled() {
        let s = WatcherState::new();
        s.shutdown.store(true, Ordering::SeqCst);
        assert!(s.shutdown.load(Ordering::SeqCst));
        s.shutdown.store(false, Ordering::SeqCst);
        assert!(!s.shutdown.load(Ordering::SeqCst));
    }
}