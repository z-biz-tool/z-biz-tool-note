/**
 * IPC 契约门（note 仓）：前端 invoke 的命令，后端必须真的注册了。
 *
 * 跑法：node --experimental-strip-types --test tests/ipcContract.test.ts
 *
 * 2026-10-22 的起因（真 bug，不是假设）：
 *   `src/components/Viewers/BinaryViewer.tsx` 的「在文件管理器中显示」调
 *   `invoke('show_in_folder')`，而**后端从来没注册过这个命令**
 *   ⇒ invoke 报 "command not found"，而前端把它 catch 掉就完事了（空 catch）
 *   ⇒ **按钮点了没有任何反应，也没有任何提示**。
 *   （db 仓把同一类叫「界面说成功、事实不是」；这里是「界面说能做、事实是啥也没发生」。）
 *
 * 这道门守四件事：
 * 1) 前端**直接** invoke 的命令（`invoke('x')`），后端必须注册了；
 * 2) 桥层（`src/lib/electronAPI.ts`）里 invoke 的命令，后端必须注册了；
 * 3) 前端用到的桥层通道（`electronAPI.invoke('kebab')`）必须真有 case 实现
 *    ——否则就是个**点了没反应的假入口**；
 * 4) 桥层里写着「Tauri 模式暂不支持」的通道 = **桌面上是假入口**，必须显式登记。
 *
 * ⚠ 口径说明：
 * - 桥层通道名是 **kebab-case**（`read-file`），后端命令名是 **snake_case**（`read_file`），
 *   两套命名 —— 所以第 1/2 条只看**直接** invoke 的字面量（后端命令名），
 *   桥层通道走第 3/4 条；
 * - 只扫 `src/`（不含 tests/）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(here, "..");
const bridgeFile = path.join(repoRoot, "src/lib/electronAPI.ts");

/* ────────────────────────── 后端 ────────────────────────── */

/** invoke_handler![] 里注册的命令名（去掉 `commands::` 前缀） */
function registeredCommands(): Set<string> {
  const lib = readFileSync(path.join(repoRoot, "src-tauri/src/lib.rs"), "utf8");
  const m = /generate_handler!\s*\[/.exec(lib);
  assert.ok(m, "没找到 generate_handler![] ⇒ 解析器可能坏了");
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (; i < lib.length; i++) {
    if (lib[i] === "[") depth++;
    else if (lib[i] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = lib.slice(m.index + m[0].length, i);
  const out = new Set<string>();
  for (const cm of body.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:::|,|$)/gm
  )) {
    out.add(cm[1].split("::").pop()!);
  }
  return out;
}

/* ────────────────────────── 前端 ────────────────────────── */

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === "node_modules" || e === "dist" || e === "tests") continue;
      out.push(...walk(p, exts));
    } else if (exts.some((x) => e.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 直接 invoke 后端命令的调用点：`invoke('x')` / `invoke<T>('x')`（排除 electronAPI.invoke） */
const DIRECT_INVOKE = /(?<!electronAPI\.)\binvoke(?:<[^>]*>)?\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g;
/** 桥层通道调用：`electronAPI.invoke('read-file')` */
const CHANNEL_CALL = /electronAPI\.invoke(?:<[^>]*>)?\s*\(\s*["']([a-z0-9_-]+)["']/g;
/** 桥层 case 标签 */
const CASE_LABEL = /\bcase\s+["']([a-z0-9_-]+)["']\s*:/g;

function scan(src: string, re: RegExp): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const text = stripComments(src);
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({
      name: m[1],
      line: text.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

const registered = registeredCommands();

const frontendFiles = walk(path.join(repoRoot, "src"), [".ts", ".tsx"]);

/** 直接 invoke（不含桥层文件） */
const directInvokes: Array<{ name: string; file: string; line: number }> = [];
for (const f of frontendFiles) {
  if (path.resolve(f) === path.resolve(bridgeFile)) continue;
  const src = readFileSync(f, "utf8");
  for (const hit of scan(src, DIRECT_INVOKE)) {
    directInvokes.push({ ...hit, file: path.relative(repoRoot, f) });
  }
}

/** 桥层里 invoke 的后端命令 */
const bridgeSrc = readFileSync(bridgeFile, "utf8");
const bridgeInvokes = scan(bridgeSrc, DIRECT_INVOKE);

/** 前端用到的桥层通道 */
const channelCalls: Array<{ name: string; file: string; line: number }> = [];
for (const f of frontendFiles) {
  const src = readFileSync(f, "utf8");
  for (const hit of scan(src, CHANNEL_CALL)) {
    channelCalls.push({ ...hit, file: path.relative(repoRoot, f) });
  }
}

/** 桥层里声明的 case 标签 */
const caseLabels = new Set(scan(bridgeSrc, CASE_LABEL).map((h) => h.name));

/* ────────────────────────── 门禁 ────────────────────────── */

test("量具本身有效（不是空跑）", () => {
  assert.ok(registered.size >= 40, `后端命令太少，解析器可能坏了: ${registered.size}`);
  assert.ok(
    directInvokes.length >= 1,
    `没扫到直接 invoke 的调用点，扫描范围可能不对: ${directInvokes.length}`
  );
  assert.ok(
    channelCalls.length >= 20,
    `桥层通道调用点太少，扫描范围可能不对: ${channelCalls.length}`
  );
});

test("前端直接 invoke 的命令，后端必须真的注册了（点了必崩）", () => {
  const bad = directInvokes
    .filter((c) => !registered.has(c.name))
    .map((c) => `${c.name}（${c.file}:${c.line}）`);
  assert.deepEqual(bad, [], `前端调了后端没注册的命令: ${bad.join(", ")}`);
});

test("桥层 invoke 的命令，后端必须真的注册了", () => {
  const bad = bridgeInvokes
    .filter((c) => !registered.has(c.name))
    .map((c) => `${c.name}（electronAPI.ts:${c.line}）`);
  assert.deepEqual(bad, [], `桥层调了后端没注册的命令: ${bad.join(", ")}`);
});

test("前端用到的桥层通道必须真有 case 实现（否则是点了没反应的假入口）", () => {
  const bad = channelCalls
    .filter((c) => !caseLabels.has(c.name))
    .map((c) => `${c.name}（${c.file}:${c.line}）`);
  assert.deepEqual(bad, [], `桥层通道没有实现: ${bad.join(", ")}`);
});

test("桥层里「Tauri 模式暂不支持」的通道 = 桌面上是假入口，必须显式登记", () => {
  // 这些通道在浏览器演示分支里能用，但桌面上直接返回失败 ⇒ 界面上的入口是假的。
  // ⇒ 要么接上真的后端命令，要么在下面的清单里写明「刻意留白」的理由。
  const FAKE_ENTRIES = new Map<string, string>([
    [
      "open-file-in-finder",
      "2026-10-22 已接上真的后端命令 `show_in_folder`（本轮新增并注册），"
        + "所以它不再是假入口 —— 这条记录保留是为了说明它**曾经**是。",
    ],
  ]);
  const hits = scan(bridgeSrc, CASE_LABEL).filter((h) => {
    // 取该 case 到下一个 case 之间的实现，看有没有「暂不支持」
    const start = bridgeSrc.indexOf(`case '${h.name}'`);
    const nextIdx = bridgeSrc.indexOf("case '", start + 10);
    const body = bridgeSrc.slice(start, nextIdx > 0 ? nextIdx : start + 800);
    return body.includes("Tauri 模式暂不支持");
  });
  const bad = hits
    .filter((h) => !FAKE_ENTRIES.has(h.name))
    .map((h) => `${h.name}（桌面上是假入口，要么接上、要么登记理由）`);
  assert.deepEqual(bad, [], bad.join("\n"));
});
