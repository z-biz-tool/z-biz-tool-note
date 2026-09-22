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

export function restoreWikiLinkEscapes(md: string): string {
  // 正则不跨行，所以按行处理与整串处理等价
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
      return fence ? line : line.replace(ESCAPED_WIKI_LINK_RE, '[[$1]]');
    })
    .join('\n');
}

/** 只对 markdown 落盘做还原；代码/CSV 等文件内容原样写出。 */
export function prepareMarkdownForWrite(filePath: string, content: string): string {
  return isMarkdownPath(filePath) ? restoreWikiLinkEscapes(content) : content;
}
