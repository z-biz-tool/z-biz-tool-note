/**
 * AI 流式对话的前端编排。
 *
 * Why（2026-10-25 实测出来的真缺口）：
 *   Rust 侧 `ai_chat_stream` 是**完整可用的 SSE 实现**（解析 `data: ` 帧、
 *   逐 token emit `ai-stream://token`、结束时 emit `ai-stream://done`），
 *   连注释都写着「前端 listen('ai-stream://token') 增量显示」——
 *   而**前端一次都没调过它、三个事件一个都没 listen** ⇒
 *   整条流式链路是死的 ⇒ 用户只能等整段生成完，中间只有一个「思考中…」。
 *
 *   （同一个后端的 `ai_chat` 注释写着「后端把一条不存在的契约写进注释」那类形状：
 *   **注释说得像已经接上了，事实是没有。**）
 *
 * 这个模块只管**编排**（订阅事件 → 触发命令 → 拼结果 → 收尾），
 * 不碰 Tauri，也不碰 React ⇒ 可以用假 listen/假 start 直接单测。
 */

/** 后端 emit 的三个事件名（与 Rust 侧 `commands.rs` 一一对应） */
export const AI_STREAM_EVENTS = {
  token: 'ai-stream://token',
  done: 'ai-stream://done',
  error: 'ai-stream://error',
} as const;

/** 订阅一个事件，返回取消订阅的函数（与 `listen` 的签名一致） */
export type AiStreamListen = (
  event: string,
  cb: (payload: unknown) => void,
) => Promise<() => void>;

export interface AiStreamDeps {
  /** 订阅事件（注入 `@tauri-apps/api/event` 的 listen） */
  listen: AiStreamListen;
  /**
   * 触发后端流式命令。
   * **resolve 只代表「命令本身没报错」** —— 正文走事件，不走返回值。
   */
  start: () => Promise<void>;
  /**
   * 命令已经返回、却还没等到 done/error 事件时的放弃期限（毫秒）。
   * 正常情况下事件早就到了 ⇒ 这个期限只是防「永远挂着」。
   */
  timeoutMs?: number;
}

/**
 * 跑一次流式对话：逐 token 回调增量，最终 resolve 完整文本。
 *
 * 三种结束方式（先到先算）：
 *   1. 收到 `ai-stream://done` ⇒ resolve（优先用事件里的 `full`，否则用累计值）；
 *   2. 收到 `ai-stream://error` ⇒ reject；
 *   3. `start()` 自己抛 ⇒ reject。
 * 无论怎么结束都会**取消订阅**（否则每次对话都漏一个监听器）。
 */
export async function runAiStream(
  deps: AiStreamDeps,
  onDelta: (delta: string) => void,
): Promise<string> {
  const { listen, start } = deps;
  const timeoutMs = deps.timeoutMs ?? 30_000;

  let acc = '';
  let settled = false;
  let unlisteners: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      for (const u of unlisteners) {
        try {
          u();
        } catch {
          /* 取消订阅失败不该影响结果 */
        }
      }
      unlisteners = [];
    };
    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(text);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    (async () => {
      // 1) 先订阅，再触发命令 —— 顺序反了就可能漏掉第一个 token
      try {
        unlisteners.push(
          await listen(AI_STREAM_EVENTS.token, (p) => {
            if (settled) return;
            const delta = typeof p === 'string' ? p : '';
            if (!delta) return;
            acc += delta;
            onDelta(delta);
          }),
        );
        unlisteners.push(
          await listen(AI_STREAM_EVENTS.done, (p) => {
            const full =
              p && typeof p === 'object' ? String((p as { full?: unknown }).full ?? '') : '';
            finish(full || acc);
          }),
        );
        unlisteners.push(
          await listen(AI_STREAM_EVENTS.error, (p) => {
            fail(
              new Error(
                typeof p === 'string' && p ? p : 'AI 流式请求失败',
              ),
            );
          }),
        );
      } catch (e) {
        fail(new Error(e instanceof Error ? e.message : String(e)));
        return;
      }

      // 2) 触发后端流式命令
      try {
        await start();
      } catch (e) {
        fail(new Error(e instanceof Error ? e.message : String(e)));
        return;
      }

      // 3) 命令回来了，但 done 事件可能还在路上 ⇒ 给它一个期限（正常是毫秒级）
      if (settled) return;
      timer = setTimeout(() => {
        fail(new Error('AI 流式响应超时：没有收到结束事件'));
      }, timeoutMs);
    })();
  });
}
