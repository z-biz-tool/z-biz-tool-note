import { isMarkdownPath } from './fileTypes';

/**
 * 还原 markdown 序列化器对 `[[双链]]` 的过度转义。
 *
 * Why: Tiptap 的 getMarkdown() 把仍是纯文本形态的双链按字面量转义成 `\[\[X\]\]`
 * （打字新增的链接、以及历史里已被转义的链接都会走到这条路径）。文件一旦落成转义形态，
 * Rust 端 extract_links 找不到相邻的 `[[`，反链面板与知识图谱就会静默丢链。
 * 这里只吃 `\[\[` … `\]\]` 这一对，其他转义（如单个 `\[`）原样保留。
 */
// 允许 1~2 层反斜杠：序列化器输出的是 \[\[X\]\]，历史文件里出现过更深的转义形态
const ESCAPED_WIKI_LINK_RE = /\\{1,2}\[\\{1,2}\[([^\[\]\n]*?)\\{1,2}\]\\{1,2}\]/g;
// 围栏内的 `\[\[X\]\]` 是用户写下的字面量（讲解双链语法的笔记很常见），不能动。
// 闭栏要求同种围栏字符且不短于开栏，与 CommonMark 一致。
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** 逐行处理，围栏代码块里的内容原样保留（开闭栏规则与 CommonMark 一致：同种字符且不短于开栏） */
function mapOutsideFences(md: string, fn: (line: string) => string): string {
  let fence = '';
  return md
    .split('\n')
    .map((line) => {
      const m = FENCE_RE.exec(line);
      if (m) {
        if (!fence) fence = m[1];
        else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = '';
        return line;
      }
      return fence ? line : fn(line);
    })
    .join('\n');
}

export function restoreWikiLinkEscapes(md: string): string {
  // 正则不跨行，所以按行处理与整串处理等价
  return mapOutsideFences(md, (line) => line.replace(ESCAPED_WIKI_LINK_RE, '[[$1]]'));
}

// `- [ ]` 后面什么都不跟（有序列表同样）
const EMPTY_TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\])\s*$/;

/**
 * 进编辑器前给空任务项补一个尾空格。
 *
 * Why: tiptap 的任务项 tokenizer 要求方括号后面必须跟内容，裸 `- [ ]` 不算任务项 —— 实测
 * `- [ ]` + `- [x] 已done` 存一次盘会变成 `- \[ \]` 和 `- 已done`：第一行退化成普通项目符号，
 * 还把下一条吞进同一条，勾选状态直接没了。内置模板（今日日记/会议记录/任务清单）和
 * Obsidian、Typora 写出来的文件里全是这种裸 `- [ ]`，所以在喂给编辑器之前先补齐。
 * 幂等：已经带尾空格或有正文的行不动；围栏里的示例代码不动。
 */
export function normalizeEmptyTaskItems(md: string): string {
  return mapOutsideFences(md, (line) => {
    const m = EMPTY_TASK_RE.exec(line);
    return m ? `${m[1]} ` : line;
  });
}

/** 只对 markdown 落盘做还原；代码/CSV 等文件内容原样写出。 */
export function prepareMarkdownForWrite(filePath: string, content: string): string {
  return isMarkdownPath(filePath) ? restoreWikiLinkEscapes(content) : content;
}
