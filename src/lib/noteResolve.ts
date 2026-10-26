/**
 * 「按笔记名找文件」的唯一真源。
 *
 * Why（2026-10-25 实测出来的真 bug，不是推测）：
 *
 *   `[[双链]]` → `handleWikiLinkNavigate` ⇒ 在**当前笔记库的文件清单**里按名字找文件；
 *   `![[嵌入]]` → `EmbedExtension` ⇒ 调后端 `read_note` ⇒ 读的是
 *   **上一代架构的 `~/.z-note/notes/{name}.md`**（那个目录现在的界面早就不用了）。
 *
 *   ⇒ **同一对孪生功能，两套解析**：双链能跳，嵌入永远显示「找不到这篇笔记」。
 *   （两个功能在同一个编辑器里、用同一种 `[[名字]]` 语法、候选清单还是同一个
 *   `wikiTargets` —— 唯一不同的就是「拿到名字之后去哪找」。）
 *
 * ⇒ 修法**不是**「把嵌入也改成 read_note」，而是把「笔记名 → 文件路径」收成
 *   **一条真源**，两个功能都用它 ⇒ 以后不可能再分家。
 *
 * 口径（与改动前 `handleWikiLinkNavigate` 的匹配逻辑**逐条一致**，只是搬了家）：
 *   1. 清单里的 `name` 去掉 `.md` / `.markdown` 后与目标相等；
 *   2. 或者路径以 `/{目标}.md` / `/{目标}.markdown` 结尾。
 *   找不到就返回 null —— **不猜**。
 */

/** 笔记清单里的一条（只用到 name 与 path 两个字段） */
export interface NoteFileLike {
  name?: string;
  path?: string;
}

/**
 * 归一化一个笔记引用：`[[目标#锚点|别名]]` → `目标`。
 *
 * 双链与嵌入共用 —— 「什么算一个笔记名」只有这一处定义。
 * （`WikiLinkExtension.parseWikiLinkTarget` 现在转调这里，避免两个归一化器分家。）
 */
export function normalizeNoteTarget(raw: string): string {
  return (raw ?? '').split('#')[0].split('|')[0].trim();
}

/** 去掉 markdown 扩展名（`.md` / `.markdown`） */
function stripMdExt(name: string): string {
  return name.replace(/\.md$/, '').replace(/\.markdown$/, '');
}

/**
 * 按笔记名在清单里找文件路径；找不到返回 null。
 *
 * @param files  当前笔记库的文件清单（App 的 `allFiles`）
 * @param target 笔记名，可以带 `#锚点` / `|别名`（内部会归一化）
 */
export function resolveNotePath(files: NoteFileLike[], target: string): string | null {
  const t = normalizeNoteTarget(target);
  if (!t) return null;
  const list = files || [];
  const hit = list.find((f) => {
    const fn = f?.name ? stripMdExt(f.name) : '';
    return (
      fn === t ||
      (f?.path?.endsWith(`/${t}.md`) ?? false) ||
      (f?.path?.endsWith(`/${t}.markdown`) ?? false)
    );
  });
  return hit?.path ?? null;
}
