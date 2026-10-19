// src/lib/sanitize.ts 的脱敏回归。
//
// Why 该测：导出是笔记**离开本机**的唯一通道，导出内容一旦带出 API Key
// 或别人的家目录路径，收件人那边就是一次真实的信息泄露。
// 脱敏规则是「正则 + 关键字表」，改一个正则很容易把某类密钥漏掉，
// 而漏掉之后在界面上完全看不出来（导出成功、文件也生成了）。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { sanitizeExport } = await import("../src/lib/sanitize.ts");

/* ───────────────────── frontmatter 敏感字段 ───────────────────── */

test("frontmatter 里的 api_key / token / password 整行被去掉", () => {
  const md = "---\ntitle: 周报\napi_key: sk-abcdefghijklmnopqrst\n---\n正文";
  const out = sanitizeExport(md);
  assert.ok(!out.includes("api_key"), "api_key 字段不该留在导出里");
  assert.ok(!out.includes("sk-abcdefghijklmnopqrst"), "密钥值不该留在导出里");
  assert.ok(out.includes("title: 周报"), "无关字段要保留");
  assert.ok(out.includes("正文"), "正文要保留");
});

test("token / password / secret 等关键字同样被去掉", () => {
  for (const key of ["token", "password", "secret", "access_token", "refresh_token", "pwd"]) {
    const md = `---\n${key}: sensitive-value\n---\n正文`;
    const out = sanitizeExport(md);
    assert.ok(!out.includes(key), `${key} 字段不该留在导出里`);
    assert.ok(!out.includes("sensitive-value"), `${key} 的值不该留在导出里`);
  }
});

test("大写 / 带连字符的变体也认（apiKey / API-KEY 这类手写写法很多）", () => {
  const md = "---\nAPI-KEY: v1\napikey: v2\n---\n正文";
  const out = sanitizeExport(md);
  assert.ok(!out.includes("v1"));
  assert.ok(!out.includes("v2"));
});

test("可以关掉 frontmatter 脱敏（用户明确要原始导出时）", () => {
  const md = "---\napi_key: keep-me\n---\n正文";
  const out = sanitizeExport(md, { stripSensitiveFrontmatter: false });
  assert.ok(out.includes("keep-me"));
});

/* ───────────────────── 路径里的用户名 ───────────────────── */

test("macOS 路径里的用户名被换成 ***", () => {
  const out = sanitizeExport("见 /Users/zhangsan/Documents/笔记.md");
  assert.equal(out, "见 /Users/***/Documents/笔记.md");
});

test("Linux 路径里的用户名被换成 ***", () => {
  const out = sanitizeExport("见 /home/lisi/notes/a.md");
  assert.equal(out, "见 /home/***/notes/a.md");
});

test("Windows 路径里的用户名被换成 ***", () => {
  const out = sanitizeExport("见 C:\\Users\\lisi\\notes\\a.md");
  assert.ok(out.includes("C:\\Users\\***"));
  assert.ok(!out.includes("lisi"));
});

test("可以关掉用户名脱敏", () => {
  const out = sanitizeExport("/Users/zhangsan/a.md", { redactUsernames: false });
  assert.ok(out.includes("zhangsan"));
});

/* ───────────────────── 正则脱敏 ───────────────────── */

test("OpenAI 风格的 sk- 密钥被替换", () => {
  const out = sanitizeExport("key = sk-abcdefghijklmnopqrstuvwx");
  assert.ok(!out.includes("sk-abcdefghijklmnopqrstuvwx"), "密钥不该原样出现");
  assert.ok(out.includes("REDACTED"));
});

test("sk-proj- 形式的密钥也被替换", () => {
  const out = sanitizeExport("key = sk-proj-abcdefghijklmnopqrstuv");
  assert.ok(!out.includes("sk-proj-abcdefghijklmnopqrstuv"));
});

test("Bearer token 被替换", () => {
  const out = sanitizeExport("Authorization: Bearer abcdefghijklmnopqrst");
  assert.ok(!out.includes("abcdefghijklmnopqrst"));
});

test("GitHub PAT 被替换", () => {
  const out = sanitizeExport("token = ghp_abcdefghijklmnopqrstuvwxyz0123");
  assert.ok(!out.includes("ghp_abcdefghijklmnopqrstuvwxyz0123"));
});

test("AWS Access Key 被替换", () => {
  const out = sanitizeExport("AKIAIOSFODNN7EXAMPLE");
  assert.ok(!out.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("私钥块整段被替换", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----";
  const out = sanitizeExport(pem);
  assert.ok(!out.includes("MIIEow"));
  assert.ok(out.includes("PRIVATE KEY REDACTED"));
});

test("短的 sk- 串不误伤（太短的不可能是密钥）", () => {
  assert.equal(sanitizeExport("sk-short"), "sk-short");
});

/* ───────────────────── 其它 ───────────────────── */

test("没有 frontmatter 的文档原样走完流程，不崩", () => {
  assert.equal(sanitizeExport("普通正文"), "普通正文");
});

test("空串不崩", () => {
  assert.equal(sanitizeExport(""), "");
});

test("正文里没有敏感内容时不被改动", () => {
  const md = "# 标题\n\n一些普通内容，没有密钥也没有家目录路径。\n";
  assert.equal(sanitizeExport(md), md);
});
