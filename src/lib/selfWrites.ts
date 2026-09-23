/**
 * 「这次写盘是我们自己干的」对账表。
 *
 * Why: notify watcher 不认人 —— Rust 侧只按 500ms 合并同一批事件、只过滤 `.tmp/.swp/`点开头
 * （watcher.rs），我们的 atomic_write 完成后不到一秒，同一个 .md 会以 `zennote://file-changed`
 * 广播回来。前端原先照单全收当成"外部改了文件"：
 *   - 没脏 → 每次自动保存后都冒一句「已加载外部修改」，并把磁盘内容重新灌回编辑器，
 *     这半秒里刚打的字就此被覆盖；
 *   - 有脏 → 弹「文件已被外部修改」确认框，选项还写着「丢弃本地并重新加载」。
 *
 * 记的必须是送进 write-file 的那个字符串（prepareMarkdownForWrite 之后的形态）：落盘的就是它，
 * 拿编辑器里的原文比对会因为 `\[\[双链\]\]` 被还原成 `[[双链]]` 而对不上。
 */
const MAX_TRACKED = 100;

/** filePath -> 我们最后一次写出去的正文 */
const lastWritten = new Map<string, string>();

export function markSelfWrite(filePath: string, content: string): void {
  // Map 保持插入序；同一条重写时先删再加，让它排到末尾，淘汰时才落不到刚写的那条上
  lastWritten.delete(filePath);
  lastWritten.set(filePath, content);
  if (lastWritten.size > MAX_TRACKED) {
    const oldest = lastWritten.keys().next().value;
    if (oldest !== undefined) lastWritten.delete(oldest);
  }
}

/** 我们最后一次写出去的正文（没记过 = undefined，说明这文件的盘上变化与我们无关） */
export const selfWriteOf = (filePath: string): string | undefined => lastWritten.get(filePath);

export function forgetSelfWrite(filePath: string): void {
  lastWritten.delete(filePath);
}

export type ExternalChangeAction = 'ignore' | 'reload' | 'confirm';

/**
 * 外部修改事件的唯一决策点（纯函数，浏览器里可以直接喂真数据跑真值表）。
 *
 * ignore：盘上的内容就是我们自己写出去的那份（或跟本地一字不差）—— 无事发生；
 * confirm：真的有人改了文件，而本地还有没保存的改动 —— 必须先问；
 * reload：真的有人改了文件，本地没改动 —— 直接换上并提示一句。
 */
export function decideExternalChange(args: {
  disk: string;
  local: string | null;
  recorded: string | null;
  isDirty: boolean;
}): ExternalChangeAction {
  const { disk, local, recorded, isDirty } = args;
  if (disk === local) return 'ignore';
  if (recorded !== null && disk === recorded) return 'ignore';
  return isDirty ? 'confirm' : 'reload';
}
