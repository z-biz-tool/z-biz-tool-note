import { useCallback, useEffect, useState } from 'react';

/**
 * 极简 YAML Frontmatter 解析器。
 *
 * 为什么不用 gray-matter：减小打包体积（gray-matter + js-yaml ≈ 100KB），
 * 且笔记 frontmatter 通常只有 title/date/tags/aliases 等少量字段。
 *
 * 支持的格式：
 * ```
 * ---
 * title: My Note
 * date: 2026-09-21
 * tags: [work, project-a]
 * aliases:
 *   - 别名 1
 *   - 别名 2
 * ---
 * 正文...
 * ```
 *
 * 局限：
 *   - 不支持嵌套对象、引用、锚点
 *   - 引号包裹的字符串保持原样（不做转义解析）
 *   - 注释只支持行尾 `#`
 */

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string; // 去掉 frontmatter 后的正文
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { data: {}, content: raw };
  }
  const [, yaml, content] = match;
  return {
    data: parseYamlBlock(yaml),
    content,
  };
}

/** 只用于标签这类受控字段的字符合法性（与 TagExtension 的 TAG_REGEX 同一套字符集） */
export const sanitizeTag = (s: string) =>
  s
    .replace(/[^\w\u4e00-\u9fa5/-]/g, '')
    .replace(/^[-/]+/, '')
    .trim();

/** 别名允许空格和常见标点，但引号没法安全地写进再读回来（自己那套 stripQuotes 不认转义），直接去掉 */
export const sanitizeAlias = (s: string) => s.replace(/["']/g, '').trim();

// 只有这些形状 plain scalar 才写得下去；其余一律加引号（stripQuotes 读得回来）
const NEEDS_QUOTE = /[:#'[\]{},&*!|>%@`]|^-|^\s|\s$/;
const yamlListItem = (v: string) => (NEEDS_QUOTE.test(v) ? `"${v}"` : v);

/** setFrontmatterTags / setFrontmatterAliases 共用：就地换掉某个列表字段 */
function setFrontmatterList(raw: string, key: string, values: string[], sanitize: (s: string) => string): string {
  const cleaned = Array.from(new Set(values.map(sanitize).filter(Boolean)));
  const open = /^---\r?\n/.exec(raw);
  const block = open ? FRONTMATTER_RE.exec(raw) : null;
  const lines: string[] = cleaned.length ? [`${key}:`] : [`${key}: []`];
  for (const v of cleaned) lines.push(`  - ${yamlListItem(v)}`);

  if (!open || !block) {
    // 没有 frontmatter：空列表就不无中生有，有则补一块
    if (!cleaned.length) return raw;
    return `---\n${lines.join('\n')}\n---\n\n${raw}`;
  }

  const yamlStart = open[0].length;
  const yaml = block[1];
  const eol = yaml.includes('\r\n') ? '\r\n' : '\n';
  const yamlLines = yaml.split(/\r?\n/);
  const start = yamlLines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  let next: string[];
  if (start < 0) {
    next = [...yamlLines, ...lines];
  } else {
    // 该字段的取值可能是紧跟的几行 - 条目（也允许中间隔空行），整段一起换掉
    let end = start + 1;
    let j = end;
    while (j < yamlLines.length && !yamlLines[j].trim()) j++;
    if (/^\s*-\s/.test(yamlLines[j] || '')) {
      for (let k = j; k < yamlLines.length; k++) {
        if (!yamlLines[k].trim()) continue;
        if (!/^\s*-\s/.test(yamlLines[k])) break;
        end = k + 1;
      }
    }
    next = [...yamlLines.slice(0, start), ...lines, ...yamlLines.slice(end)];
  }
  return raw.slice(0, yamlStart) + next.join(eol) + raw.slice(yamlStart + yaml.length);
}

/**
 * 就地换掉 frontmatter 里的 `tags:` 那一段，其它行一个字不动。
 *
 * Why 不用 stringifyFrontmatter 整块重排：那套序列化写的是裸值
 * （`title: 会议: 周会`、带 `#` 的日期说明都会被写坏成非法 YAML 或被 stripQuotes 吃掉），
 * 而"改一个标签"不该顺手把别人的元数据全重排一遍。
 *
 * 认三种既有写法：块列表（`tags:` + `- x`，中间可以隔空行，与 parseYamlBlock 同口径）、
 * 内联（`tags: [a, b]`）、标量（`tags: 阅读`）。原来没有这一项就在块尾追加。
 */
export function setFrontmatterTags(raw: string, tags: string[]): string {
  return setFrontmatterList(raw, 'tags', tags, sanitizeTag);
}

/** 同 setFrontmatterTags，只是别名的取值允许空格和更多标点（必要时加引号写回） */
export function setFrontmatterAliases(raw: string, aliases: string[]): string {
  return setFrontmatterList(raw, 'aliases', aliases, sanitizeAlias);
}

/** 行式 YAML 解析：仅支持 key: value、数组内联、数组多行三种形态 */
function parseYamlBlock(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const valuePart = line.slice(colonIdx + 1).trim();

    // 数组多行：`tags:` 后面（可以隔着空行）是 `- xxx`
    //
    // 必须容得下空行：所见即所得把这篇笔记存一次，YAML 会被重新序列化成
    // `tags:` + 空行 + `- reading`（合法 YAML），按"下一行必须是条目"判就会把
    // 整个列表读没，编辑一次标签就全丢。
    if (valuePart === '') {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && /^\s*-\s/.test(lines[j])) {
        const arr: string[] = [];
        let lastItem = j;
        for (let k = j; k < lines.length; k++) {
          if (!lines[k].trim()) continue;
          if (!/^\s*-\s/.test(lines[k])) break;
          // 条目也可能是带引号的（setFrontmatterList 给含 `:` `#` 的值加引号），要按同样口径剥掉
          arr.push(stripQuotes(lines[k].replace(/^\s*-\s*/, '').trim()));
          lastItem = k;
        }
        result[key] = arr;
        i = lastItem + 1;
        continue;
      }
    }

    // 数组内联：`tags: [a, b, c]`
    if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      result[key] = valuePart
        .slice(1, -1)
        .split(',')
        .map(s => stripQuotes(s.trim()))
        .filter(Boolean);
      i++;
      continue;
    }

    // 标量
    result[key] = stripQuotes(valuePart);
    i++;
  }
  return result;
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  // 去除行尾注释
  const hashIdx = s.indexOf(' #');
  return hashIdx >= 0 ? s.slice(0, hashIdx).trim() : s;
}

/** 序列化 frontmatter（写回文件用） */
export function stringifyFrontmatter(data: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (value === undefined || value === null) {
      lines.push(`${key}:`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

/**
 * 提取标签：优先从 frontmatter.tags 读取，fallback 到正文 `#tag` 解析。
 *
 * 口径与 Rust `extract::extract_tags` 一致，改一边要同步另一边。
 */
export function extractTagsSmart(raw: string): string[] {
  const { data, content } = parseFrontmatter(raw);
  const fromFront = data.tags;
  if (Array.isArray(fromFront)) {
    return Array.from(new Set(fromFront.map(String).filter(Boolean)));
  }
  if (typeof fromFront === 'string' && fromFront) {
    return [fromFront];
  }
  return inlineTags(content);
}

/** Rust `is_alphanumeric` 的对应物：字母、数字、连字符都留，标点/括号/引号才剥 */
const TAG_KEEP = /[\p{L}\p{N}-]/u;

function trimTagEdges(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && !TAG_KEEP.test(s[a])) a++;
  while (b > a && !TAG_KEEP.test(s[b - 1])) b--;
  return s.slice(a, b);
}

/** 正文里的 `#tag`：跟 Rust 一样两头剥标点、20 字符上限、结果排序 */
function inlineTags(body: string): string[] {
  const tags = new Set<string>();
  for (const line of body.split('\n')) {
    for (const word of line.split(/\s+/)) {
      if (!word.startsWith('#') || word.length < 2) continue;
      const tag = trimTagEdges(word.replace(/^#+/, ''));
      // 上限按字符数算：按字节的话 7 个汉字的标签就被静默丢掉了
      if (tag && [...tag].length < 20) tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}

/** 去掉 ATX 标题前缀（`#`~`######` 且紧跟空白）；`#标签` 没有空格，原样返回 */
function stripHeadingPrefix(line: string): string {
  let i = 0;
  while (i < line.length && line[i] === '#') i++;
  if (i === 0 || i > 6) return line;
  const rest = line.slice(i);
  if (rest === '') return '';
  return /\s/.test(rest[0]) ? rest.trimStart() : line;
}

/**
 * 提取标题：与 Rust `extract::extract_title` 同一条口径 ——
 * 剥掉 frontmatter，取第一条「有内容」的行（空行和只写了井号的行跳过），超 50 字符截断。
 */
export function extractTitle(raw: string): string {
  for (const line of parseFrontmatter(raw).content.split('\n')) {
    const title = stripHeadingPrefix(line.trim());
    if (!title) continue;
    const chars = [...title];
    return chars.length > 50 ? `${chars.slice(0, 50).join('')}...` : title;
  }
  return '无标题笔记';
}

/**
 * 读取正文（去掉 frontmatter）供编辑器展示
 */
export function stripFrontmatter(raw: string): string {
  return parseFrontmatter(raw).content;
}

/**
 * 原样取出文件开头的 frontmatter 块（含闭合 `---` 那一行及其换行）；没有则返回 ''。
 *
 * 直接切前缀而不是重新序列化：YAML 里的手写缩进、引号风格都要一字不动地还回去。
 */
export function frontmatterBlock(raw: string): string {
  const body = parseFrontmatter(raw).content;
  return body === raw ? '' : raw.slice(0, raw.length - body.length);
}

/**
 * 把编辑器回写的正文前面补回原来的 frontmatter。
 *
 * 所见即所得编辑器只会看到正文，回写的也就少了 YAML 头；不补回来的话保存一次
 * 元数据就没了。已经带着头（比如调用方给的是整篇原文）时不再重复前插。
 */
export function withFrontmatter(raw: string, body: string): string {
  const fm = frontmatterBlock(raw);
  return !fm || body.startsWith(fm) ? body : fm + body;
}

/**
 * 持久化的 frontmatter 合并（写文件时把更新过的字段写回）
 */
export function mergeFrontmatter(
  raw: string,
  updates: Record<string, unknown>,
): string {
  const { data, content } = parseFrontmatter(raw);
  const next = { ...data, ...updates };
  return stringifyFrontmatter(next) + content;
}

/**
 * React Hook：把正文分离出 frontmatter + 内容。
 * 用于编辑器顶部展示元数据卡片，并把正文传给 Tiptap。
 */
export function useFrontmatter(raw: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const [state, setState] = useState(() => parseFrontmatter(raw));

  // 当原始内容变化（外部写入）时重新解析
  useEffect(() => {
    setState(parseFrontmatter(raw));
  }, [raw]);

  const updateMeta = useCallback((patch: Record<string, unknown>) => {
    setState(prev => ({
      data: { ...prev.data, ...patch },
      content: prev.content,
    }));
  }, []);

  return {
    meta: state.data,
    body: state.content,
  };
}