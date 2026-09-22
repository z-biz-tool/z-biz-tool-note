/**
 * 导出内容脱敏（避免分享时泄露 API Key / 绝对路径等敏感信息）。
 *
 * 默认开启：调用方传入 `sanitize=true` 即脱敏；用户可选 raw 导出。
 */

interface SanitizeOptions {
  /** 是否移除 frontmatter 中的敏感字段（默认 true） */
  stripSensitiveFrontmatter?: boolean;
  /** 是否替换绝对路径中的用户名（默认 true） */
  redactUsernames?: boolean;
}

const DEFAULT_OPTS: Required<SanitizeOptions> = {
  stripSensitiveFrontmatter: true,
  redactUsernames: true,
};

const SENSITIVE_FRONTMATTER_KEYS = [
  'api_key',
  'apikey',
  'api-key',
  'token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'private_key',
  'private-key',
  'access_token',
  'refresh_token',
];

const RULES: Array<{ re: RegExp; replace: string }> = [
  // OpenAI / Anthropic / Google API Key
  { re: /sk-[A-Za-z0-9_\-]{16,}/g, replace: 'sk-***REDACTED***' },
  { re: /sk-proj-[A-Za-z0-9_\-]{16,}/g, replace: 'sk-proj-***REDACTED***' },
  // Bearer Token
  { re: /Bearer\s+[A-Za-z0-9._\-]{16,}/g, replace: 'Bearer ***' },
  // GitHub PAT
  { re: /ghp_[A-Za-z0-9]{20,}/g, replace: 'ghp_***REDACTED***' },
  // AWS Access Key
  { re: /AKIA[0-9A-Z]{16}/g, replace: 'AKIA***REDACTED***' },
  // 私钥块
  { re: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, replace: '***PRIVATE KEY REDACTED***' },
];

export function sanitizeExport(content: string, opts: SanitizeOptions = {}): string {
  const o = { ...DEFAULT_OPTS, ...opts };
  let out = content;

  // 1. frontmatter 敏感字段
  if (o.stripSensitiveFrontmatter) {
    out = stripFrontmatterSensitive(out);
  }

  // 2. 用户名（macOS/Linux 路径）
  if (o.redactUsernames) {
    out = out.replace(/\/Users\/[^/\s'"<>]+/g, '/Users/***');
    out = out.replace(/\/home\/[^/\s'"<>]+/g, '/home/***');
    // Windows: C:\Users\<name>
    out = out.replace(/[A-Z]:\\Users\\[^\\\s'"<>]+/gi, 'C:\\Users\\***');
  }

  // 3. 正则脱敏
  for (const { re, replace } of RULES) {
    out = out.replace(re, replace);
  }

  return out;
}

function stripFrontmatterSensitive(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return content;
  const yaml = match[1];
  const filtered = yaml
    .split(/\r?\n/)
    .filter(line => {
      const key = line.split(':')[0].trim().toLowerCase();
      return !SENSITIVE_FRONTMATTER_KEYS.includes(key);
    })
    .join('\n');
  return `---\n${filtered}\n---${content.slice(match[0].length)}`;
}

export const __test_rules = RULES;