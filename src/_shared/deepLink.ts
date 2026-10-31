/**
 * zbiz:// 深链接的 **note 语义层**。
 *
 * ## 分工
 *
 * | 层 | 在哪 | 管什么 |
 * |----|----|--------|
 * | 协议 | `z-biz-tool-shared/protocol/deeplink` | 字节级编解码（金标 = Rust `cap-hub`） |
 * | 机制 | `z-biz-tool-shared/protocol/deeplinkReceiver` | 冷启动补取、事件监听、不静默吞掉 |
 * | **语义** | **本文件** | **收到深链后 note 该做什么** |
 *
 * ## note 支持的动作
 *
 * | action | 含义 | 参数 |
 * |--------|------|------|
 * | `open` | 打开一个笔记文件 | `file`（路径）、可选 `query`（打开后定位到的文本）、可选 `line`（行号） |
 * | `search` | 只带搜索意图 | `query`（必填）、可选 `file`（限定在某文件里找） |
 *
 * ## 关于「note 的 id 就是文件路径」
 *
 * note 没有独立的笔记 id —— `Note.id` 就是文件的绝对路径（见 App.tsx 的
 * `openNote`）。所以深链里的 `file` 参数是**绝对路径**，不是某个短 id。
 * 这一点在协议层说不清楚会在跨仓对接时踩：发送方以为能传短 id，
 * 结果 note 侧拿到一个打不开的路径。
 */

import type { Handoff } from "z-biz-tool-shared/protocol";

/**
 * Rust 侧 `cap_hub::Handoff` 的镜像。
 *
 * 名字叫 `HandoffItem` 是为了在本仓内部读起来更顺（本仓此前一直用这个名字），
 * 实质就是共享层的 `Handoff`。
 */
export type { Handoff as HandoffItem } from "z-biz-tool-shared/protocol";

/**
 * note 的深链结果。
 *
 * `file` 非 null 表示要打开某个文件；
 * `problem` 非 null 表示接不住 —— 前端必须给可见提示（不静默吞掉）。
 */
export interface NoteDeepLinkOutcome {
  /** 要打开的文件路径；null 表示不带打开意图 */
  file: string | null;
  /** 打开后要定位的文本；null 表示不定位 */
  query: string | null;
  /** 打开后要定位的行号；null 表示不定位 */
  line: number | null;
  /** 发送方（from），仅用于提示与日志 */
  from: string | null;
  /** 无法适配时的原因 */
  problem: string | null;
}

/**
 * 把一条深链翻译成 note 内的动作。
 *
 * 纯函数 —— 不碰 React 状态、不碰 Tauri，所以可以直接单测。
 *
 * @param item 深链
 */
export function resolveNoteDeepLink(item: Handoff): NoteDeepLinkOutcome {
  const outcome: NoteDeepLinkOutcome = {
    file: null,
    query: null,
    line: null,
    from: item.params.from ?? null,
    problem: null,
  };

  const action = item.action.trim() || "open";
  const file = item.params.file?.trim() ?? "";
  const query = item.params.query?.trim() ?? "";
  const rawLine = item.params.line?.trim() ?? "";

  // 行号只在是正整数时才算数：0 和负数是无效的行号，
  // 传它们等于让编辑器滚到一个不存在的位置。
  let line: number | null = null;
  if (rawLine) {
    const n = Number(rawLine);
    if (Number.isInteger(n) && n > 0) line = n;
    // 非整数行号直接忽略而不是报错 —— 行号是可选的锦上添花，
    // 不该因为它坏了就连文件都打不开。
  }

  if (action === "open") {
    if (!file) {
      outcome.problem = "深链里没有 file 参数";
      return outcome;
    }
    outcome.file = file;
    outcome.query = query || null;
    outcome.line = line;
    return outcome;
  }

  if (action === "search") {
    if (!query) {
      outcome.problem = "深链里没有 query 参数";
      return outcome;
    }
    outcome.file = file || null;
    outcome.query = query;
    outcome.line = line;
    return outcome;
  }

  outcome.problem = `不认识的动作 ${action}`;
  return outcome;
}
