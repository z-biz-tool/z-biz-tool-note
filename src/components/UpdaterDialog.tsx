import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const formatSize = (b: number) => {
  if (!b) return "0 B";
  const k = 1024;
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), u.length - 1);
  return `${(b / Math.pow(k, i)).toFixed(1)} ${u[i]}`;
};

/**
 * 自动更新闸门（2026-10-26 家族分发底座统一接入）。
 *
 * - 窗口 ready 之后延时 delayMs 再 check()，不拖慢首屏；
 * - 检查失败（endpoint 尚未生成 latest.json / 离线 / 浏览器预览）一律静默降级；
 * - 有更新 ⇒ 弹窗：版本号 + release notes +「立即更新 / 稍后」；
 * - 下载进度按 chunk 累加；安装完成后提示重启（一键 relaunch）。
 *
 * note 不用 antd，所以这里复用本仓的 .modal-* 样式，不引入新依赖。
 * endpoint 与 pubkey 见 src-tauri/tauri.conf.json 的 plugins.updater；
 * 发布侧由 .github/workflows/build-release.yml 生成并推送 latest.json。
 */
export default function UpdaterGate({ delayMs = 5000 }: { delayMs?: number }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<"idle" | "downloading" | "done">("idle");
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const found = await check();
          if (found && !cancelled) setUpdate(found);
        } catch (e) {
          // 浏览器预览、离线、manifest 未生成都走这里：不影响正常使用
          console.warn("[updater] 检查更新失败（已静默）:", e);
        }
      })();
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [delayMs]);

  const dismiss = useCallback(() => {
    if (phase === "downloading") return;
    // Update 在 Rust 侧持有资源，不安装就主动释放
    if (update)
      void update.close().catch((e) => {
        console.warn('[updater] 释放更新资源失败:', e);
      });
    setUpdate(null);
    setPhase("idle");
    setReceived(0);
    setTotal(0);
    setError("");
  }, [phase, update]);

  useEffect(() => {
    if (!update) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, dismiss]);

  const startUpdate = useCallback(async () => {
    if (!update) return;
    setPhase("downloading");
    setReceived(0);
    setTotal(0);
    setError("");
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setTotal(event.data.contentLength ?? 0);
        } else if (event.event === "Progress") {
          setReceived((prev) => prev + event.data.chunkLength);
        }
      });
      setPhase("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("更新下载失败：" + msg);
      setPhase("idle");
    }
  }, [update]);

  const restart = useCallback(async () => {
    setRestarting(true);
    try {
      await relaunch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError("重启失败，请手动重启应用：" + msg);
      setRestarting(false);
    }
  }, []);

  if (!update) return null;

  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="发现新版本"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="modal-dialog updater-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>发现新版本</h2>
          {phase !== "downloading" && (
            <button className="toolbar-btn" onClick={dismiss} aria-label="关闭">
              ×
            </button>
          )}
        </div>

        <div className="modal-body">
          <p className="updater-versions">
            当前版本 v{update.currentVersion} → 新版本 <strong>v{update.version}</strong>
          </p>

          {update.body && (
            <pre className="updater-notes" aria-label="更新内容">
              {update.body}
            </pre>
          )}

          {phase === "downloading" && (
            <div className="updater-progress" aria-live="polite">
              <div className="updater-progress-text">
                正在下载… {formatSize(received)}
                {total > 0 ? ` / ${formatSize(total)}` : ""}
              </div>
              <div className="updater-progress-track">
                <div className="updater-progress-bar" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}

          {phase === "done" && <p className="updater-hint">更新已下载并安装，重启应用后生效。</p>}
          {error && (
            <p className="updater-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="modal-footer">
          {phase === "idle" && (
            <>
              <button className="btn-secondary" onClick={dismiss}>
                稍后
              </button>
              <button className="btn-primary" onClick={startUpdate}>
                立即更新
              </button>
            </>
          )}
          {phase === "downloading" && (
            <button className="btn-secondary" disabled>
              下载中…
            </button>
          )}
          {phase === "done" && (
            <>
              <button className="btn-secondary" onClick={dismiss}>
                稍后
              </button>
              <button className="btn-primary" onClick={restart} disabled={restarting}>
                {restarting ? "重启中…" : "立即重启"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
