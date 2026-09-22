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

    // 数组多行：`tags:` 下一行是 `  - xxx`
    if (valuePart === '' && i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) {
      const arr: string[] = [];
      i++;
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        arr.push(lines[i].replace(/^\s*-\s*/, '').trim());
        i++;
      }
      result[key] = arr;
      continue;
    }

    // 数组内联：`tags: [a, b, c]`
    if (valuePart.startsWith('[') && valuePart.endsWith(']')) {
      result[key] = valuePart
        .slice(1, -1)
        .split(',')
        .map(s => s.trim())
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
  // fallback：解析正文 #tag
  const tags = new Set<string>();
  for (const line of content.split('\n')) {
    for (const word of line.split(/\s+/)) {
      if (word.startsWith('#') && word.length > 1) {
        const tag = word.slice(1).replace(/[^\w\u4e00-\u9fff-]/g, '');
        if (tag) tags.add(tag);
      }
    }
  }
  return Array.from(tags);
}

/**
 * 读取正文（去掉 frontmatter）供编辑器展示
 */
export function stripFrontmatter(raw: string): string {
  return parseFrontmatter(raw).content;
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