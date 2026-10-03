// frontmatter.ts 的纯逻辑回归（13 个导出里除 useFrontmatter 外的全部）。
//
// 为什么该测：frontmatter 是全仓唯一的「用户手写 YAML ↔ 应用内数据」转换层，
// 解析器（parseYamlBlock）和序列化器（stringifyFrontmatter / setFrontmatterList）
// 各自一套写法，且不少能力是刻意受限的（不支持嵌套、不做引号转义）。
// 这些行为没有类型约束、也没有别的测试覆盖，一旦被"顺手优化"就会静默丢元数据
// （改一个标签把整块 aliases 读没、保存一次把 date 写坏），必须有钉子钉住。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
//
// 注：frontmatter.ts 顶部为 useFrontmatter 引了 react，而这个仓不装 node_modules，
// 所以这里用 module.registerHooks 把 'react' 短路到一个 data: URL 桩上，
// 只为让模块能加载 —— 测试只碰纯函数，不调 Hook。
import { test } from "node:test";
import assert from "node:assert/strict";
import module from "node:module";

const REACT_STUB =
  "data:text/javascript," +
  encodeURIComponent(
    "export const useState=()=>[undefined,()=>{}];" +
      "export const useEffect=()=>{};" +
      "export const useCallback=(f)=>f;",
  );

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") return { url: REACT_STUB, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const fm = await import("../src/lib/frontmatter.ts");

const parseFrontmatter = fm.parseFrontmatter;
const sanitizeTag = fm.sanitizeTag;
const sanitizeAlias = fm.sanitizeAlias;
const setFrontmatterTags = fm.setFrontmatterTags;
const setFrontmatterAliases = fm.setFrontmatterAliases;
const stringifyFrontmatter = fm.stringifyFrontmatter;
const extractTagsSmart = fm.extractTagsSmart;
const extractTitle = fm.extractTitle;
const stripFrontmatter = fm.stripFrontmatter;
const frontmatterBlock = fm.frontmatterBlock;
const withFrontmatter = fm.withFrontmatter;
const mergeFrontmatter = fm.mergeFrontmatter;

/** 取解析结果的 data，省得每条都写 .data */
const data = (raw: string) => fm.parseFrontmatter(raw).data;
/** 取解析结果的正文 */
const body = (raw: string) => fm.parseFrontmatter(raw).content;

/* ───────────────────────── parseFrontmatter ───────────────────────── */

test("没有 frontmatter 的文档：整篇当正文，data 为空对象", () => {
  const raw = "# 标题\n正文 #标签\n";
  assert.deepEqual(data(raw), {});
  assert.equal(body(raw), raw, "正文必须逐字保持，含首尾换行");
});

test("空字符串不崩，返回空 data + 空正文", () => {
  assert.deepEqual(fm.parseFrontmatter(""), { data: {}, content: "" });
});

test("空的 frontmatter 块（只有分隔符没内容）当前不被识别，`---` 会漏进正文", () => {
  // 实测行为，正则要求分隔符之间至少有一个换行。照钉住现状，
  // 真要修得连同 stripFrontmatter/extractTitle 一起改，所以这里只锁住行为。
  const raw = "---\n---\n正文";
  assert.deepEqual(data(raw), {});
  assert.equal(body(raw), raw);
});

test("CRLF 文档能解析，正文保留 \\r\\n 原样", () => {
  const r = fm.parseFrontmatter("---\r\ntitle: 周会\r\ntags:\r\n  - a\r\n---\r\n正文\r\n");
  assert.deepEqual(r.data, { title: "周会", tags: ["a"] });
  assert.equal(r.content, "正文\r\n");
});

test("值里带冒号：`title: 会议: 周会` 整段保留，不在第二个冒号处截断", () => {
  assert.equal(data("---\ntitle: 会议: 周会\n---\nB").title, "会议: 周会");
});

test("引号包裹的值剥掉引号，值内冒号/井号都不再当分隔符", () => {
  assert.equal(data('---\ntitle: "a: b"\n---\nB').title, "a: b");
  assert.equal(data("---\ntitle: 'a: b'\n---\nB").title, "a: b");
  assert.equal(data('---\ntitle: "a # b"\n---\nB').title, "a # b", "引号内的 ' #' 不是注释");
});

test("引号不配对时原样保留，不吃掉半个字符", () => {
  assert.equal(data('---\ntitle: "abc\n---\nB').title, '"abc');
  assert.equal(data('---\ntitle: abc"\n---\nB').title, 'abc"');
});

test("多行数组中间隔着空行仍要读全（所见即所得存一次会插空行，丢列表就等于丢元数据）", () => {
  assert.deepEqual(data("---\ntags:\n\n  - a\n\n  - b\n---\nB").tags, ["a", "b"]);
});

test("多行数组的条目自带引号时按同口径剥掉（与写回端对齐）", () => {
  assert.deepEqual(data('---\ntags:\n  - "a: b"\n  - c\n---\nB').tags, ["a: b", "c"]);
});

test("内联数组 [a, b] 与多行数组读出来是同一个形状", () => {
  assert.deepEqual(data("---\ntags: [a, b]\n---\nB").tags, data("---\ntags:\n  - a\n  - b\n---\nB").tags);
});

test("内联数组里的引号逗号会被切断（已知限制，写的时候别这么写）", () => {
  // 实测：`"c, d"` 被切成 `"c` 和 `d"`。pin 住现状，
  // 以后真要支持转义得同时改 stripQuotes 与 setFrontmatterList。
  assert.deepEqual(data('---\ntags: [a, "c, d"]\n---\nB').tags, ["a", '"c', 'd"']);
});

test("值为空的 key 读成空字符串，key 本身不丢", () => {
  assert.deepEqual(data("---\ntitle:\n---\nB"), { title: "" });
});

test("只写了 key 后面接空行（没有 - 条目）不算数组", () => {
  assert.equal(data("---\ntitle:\n\n---\nB").title, "");
});

test("行尾 ` #` 注释被剥掉；`#` 紧贴文字不算注释", () => {
  assert.equal(data("---\ntitle: x  # 说明\n---\nB").title, "x");
  assert.equal(data("---\ntitle: x#tag\n---\nB").title, "x#tag");
});

test("整行注释和没有冒号的行被跳过，不报错", () => {
  assert.deepEqual(data("---\n# 注释\n孤行\ntitle: x\n---\nB"), { title: "x" });
});

test("重复 key 后者覆盖前者（最后一次生效）", () => {
  assert.deepEqual(data("---\na: 1\na: 2\n---\nB"), { a: "2" });
});

test("数字/布尔全是字符串，不做类型转换", () => {
  assert.deepEqual(data("---\nn: 42\nb: true\nf: 1.5\n---\nB"), { n: "42", b: "true", f: "1.5" });
});

test("缩进的嵌套 key 会漏成顶层 key（不支持嵌套，已知限制）", () => {
  // 实测：`author:` + 缩进的 `name:` 变成 { author: "", name: "me" }。
  assert.deepEqual(data("---\nauthor:\n  name: me\n---\nB"), { author: "", name: "me" });
});

test("未闭合的 `---` 不当 frontmatter：降级返回，不抛错", () => {
  const raw = "---\ntitle: x\n正文没有闭合";
  assert.deepEqual(fm.parseFrontmatter(raw), { data: {}, content: raw });
});

test("正文中间出现的 `---` 不会被误认成 frontmatter（只认文档开头）", () => {
  const raw = "正文\n---\ntitle: x\n---\n";
  assert.deepEqual(fm.parseFrontmatter(raw), { data: {}, content: raw });
});

test("闭合 `---` 后没有换行也能解析，正文为空串", () => {
  assert.deepEqual(fm.parseFrontmatter("---\ntitle: x\n---"), { data: { title: "x" }, content: "" });
});

test("正文本身以 `---` 开头时不会被当成第二个 frontmatter", () => {
  assert.equal(body("---\ntitle: x\n---\n---\n更多"), "---\n更多");
});

/* ─────────────────── sanitizeTag / sanitizeAlias ─────────────────── */

test("sanitizeTag 剥掉字母数字/中文/斜杠/连字符之外的一切", () => {
  assert.equal(sanitizeTag("a,b"), "ab");
  assert.equal(sanitizeTag("tag!!"), "tag");
  assert.equal(sanitizeTag("50%"), "50");
  assert.equal(sanitizeTag("a\\b"), "ab");
});

test("sanitizeTag 去掉开头的 - 和 /，避免写出非法的列表项", () => {
  assert.equal(sanitizeTag("-tag"), "tag");
  assert.equal(sanitizeTag("/tag"), "tag");
});

test("sanitizeTag 允许 a/b-c 这种层级写法，中文和空格也能留（空格除外）", () => {
  assert.equal(sanitizeTag("a/b-c"), "a/b-c");
  assert.equal(sanitizeTag("中文 标签"), "中文标签");
});

test("sanitizeAlias 保留空格与标点，只剥引号并 trim", () => {
  assert.equal(sanitizeAlias("my alias"), "my alias");
  assert.equal(sanitizeAlias("a:b"), "a:b");
  assert.equal(sanitizeAlias('say "hi"'), "say hi");
  assert.equal(sanitizeAlias("  x  "), "x");
});

test("sanitizeAlias 连单引号一起剥（引号没法安全往返，宁可丢）", () => {
  assert.equal(sanitizeAlias("it's"), "its");
});

/* ────────────── setFrontmatterTags / setFrontmatterAliases ────────────── */

test("没有 frontmatter 且给了标签：在最前面补一块，正文一个字不动", () => {
  assert.equal(
    setFrontmatterTags("body text", ["a", "b"]),
    "---\ntags:\n  - a\n  - b\n---\n\nbody text",
  );
});

test("没有 frontmatter 且标签为空：原文一字不动，不无中生有", () => {
  assert.equal(setFrontmatterTags("body text", []), "body text");
  assert.equal(setFrontmatterTags("", []), "");
});

test("已有 frontmatter 但没有 tags 字段：追加到 YAML 块末尾", () => {
  assert.equal(setFrontmatterTags("---\ntitle: x\n---\nbody", ["a"]), "---\ntitle: x\ntags:\n  - a\n---\nbody");
});

test("已有 frontmatter 但没有 tags 字段且传空列表：补成 `tags: []` 而不是留空", () => {
  assert.equal(setFrontmatterTags("---\ntitle: x\n---\nbody", []), "---\ntitle: x\ntags: []\n---\nbody");
});

test("块列表 / 内联数组 / 标量三种既有写法都会被换成统一的块列表", () => {
  const cases: Array<[既有写法, 期望写回]> = [
    ["---\ntitle: x\ntags:\n  - old\n---\nbody", "---\ntitle: x\ntags:\n  - new\n---\nbody"],
    ["---\ntags: [a, b]\n---\nbody", "---\ntags:\n  - new\n---\nbody"],
    ["---\ntags: 阅读\n---\nbody", "---\ntags:\n  - new\n---\nbody"],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(setFrontmatterTags(raw, ["new"]), expected);
  }
});

test("换标签时其余字段（含手写缩进、空行）原样保留", () => {
  const raw = "---\ntitle:   x\n\ndate: 2026-01-02\ntags:\n\n  - a\n\n  - b\n---\nbody";
  assert.equal(
    setFrontmatterTags(raw, ["z"]),
    "---\ntitle:   x\n\ndate: 2026-01-02\ntags:\n  - z\n---\nbody",
  );
});

test("CRLF 文档改完标签还是 CRLF（不能混进 LF 把行尾搞乱）", () => {
  assert.equal(
    setFrontmatterTags("---\r\ntitle: x\r\ntags:\r\n  - old\r\n---\r\nbody", ["new"]),
    "---\r\ntitle: x\r\ntags:\r\n  - new\r\n---\r\nbody",
  );
});

test("标签先去重再去空，顺序按首次出现", () => {
  assert.equal(
    setFrontmatterTags("---\ntitle: x\n---\nb", ["a", "a", "b", "#c", "", "!d!"]),
    "---\ntitle: x\ntags:\n  - a\n  - b\n  - c\n  - d\n---\nb",
  );
});

test("标签里的 `:` `#` 已被 sanitizeTag 吃掉，所以标签永远不会触发加引号", () => {
  // 这条锁住"写回端加引号"这条分支对 tags 是死代码，别误以为标签被转义了。
  assert.equal(setFrontmatterTags("---\ntitle: x\n---\nb", ["a:b", "a#b"]), "---\ntitle: x\ntags:\n  - ab\n---\nb");
});

test("别名的 `:` `#` 前导 `-` 会加引号写回，并且能原样读回来（往返不断）", () => {
  const raw = "---\ntitle: x\n---\nb";
  const written = setFrontmatterAliases(raw, ["a: b", "-x", "a#b", "plain"]);
  assert.equal(written, '---\ntitle: x\naliases:\n  - "a: b"\n  - "-x"\n  - "a#b"\n  - plain\n---\nb');
  assert.deepEqual(data(written).aliases, ["a: b", "-x", "a#b", "plain"]);
});

test("别名允许空格，且去掉首尾空格后去重", () => {
  assert.equal(
    setFrontmatterAliases("---\ntitle: x\n---\nb", ["my alias", "a", " a "]),
    "---\ntitle: x\naliases:\n  - my alias\n  - a\n---\nb",
  );
});

test("清空列表写成 `tags: []`（这样读回来还是数组，不会退化成空字符串）", () => {
  assert.equal(setFrontmatterTags("---\ntags:\n  - a\n---\nbody", []), "---\ntags: []\n---\nbody");
  assert.deepEqual(data("---\ntags: []\n---\nbody").tags, []);
});

test("`tagsExtra:` 不会被 `tags` 的正则误伤", () => {
  assert.equal(
    setFrontmatterTags("---\ntagsExtra: 1\n---\nb", ["a"]),
    "---\ntagsExtra: 1\ntags:\n  - a\n---\nb",
  );
});

test("key 冒号前有空格（`tags :`）也能定位到并被规范成 `tags:`", () => {
  assert.equal(setFrontmatterTags("---\ntags :\n  - old\n---\nb", ["new"]), "---\ntags:\n  - new\n---\nb");
});

test("缩进过的 key 定位不到，会多出一份重复的 tags（已知限制，照实测钉住）", () => {
  assert.equal(
    setFrontmatterTags("---\n  tags:\n  - old\n---\nb", ["new"]),
    "---\n  tags:\n  - old\ntags:\n  - new\n---\nb",
  );
});

test("未闭合 `---` 的文档改标签时原样返回，不许塞出第二块 frontmatter（2026-10-03 已修）", () => {
  // 这条原本锁的是**结构损坏**：open 匹配到了、block 没匹配上，却走了
  // "没有 frontmatter 就前面补一块"的分支，于是原文那半截 `---` 被挤到
  // 第二块后面，一篇文档出现两块 frontmatter，解析时只认得第一块，
  // 原标题等元数据被当成正文 —— 存一次丢一次数据。
  //
  // 现在半开块一律原样返回：改标签静默不生效，但文档结构一个字节没动。
  assert.equal(setFrontmatterTags("---\ntitle: x", ["a"]), "---\ntitle: x");
  assert.equal(setFrontmatterAliases("---\ntitle: x", ["别名"]), "---\ntitle: x");

  // 正常闭合的文档不受影响，仍然该改就改
  assert.equal(
    setFrontmatterTags("---\ntitle: x\n---\n\n正文", ["a"]),
    "---\ntitle: x\ntags:\n  - a\n---\n\n正文",
  );
  // 确实没有 frontmatter 的文档，仍然正常补一块
  assert.equal(setFrontmatterTags("# 正文", ["a"]), "---\ntags:\n  - a\n---\n\n# 正文");
});

/* ──────────────────────── stringifyFrontmatter ──────────────────────── */

test("stringify 标量形态：`key: value`，块尾带一个换行", () => {
  assert.equal(stringifyFrontmatter({ title: "x", n: 3 }), "---\ntitle: x\nn: 3\n---\n");
});

test("stringify 数组写成块列表，空对象只留两个分隔符", () => {
  assert.equal(stringifyFrontmatter({ tags: ["a", "b"] }), "---\ntags:\n  - a\n  - b\n---\n");
  assert.equal(stringifyFrontmatter({}), "---\n---\n");
});

test("null / undefined 写成空值 key 而不是字符串 'null'", () => {
  assert.equal(stringifyFrontmatter({ a: null, b: undefined }), "---\na:\nb:\n---\n");
});

test("往返：标量与数组经 stringify → parse 后拿回同口径数据（值统一是字符串）", () => {
  const original = { title: "周会: 第 3 期", date: "2026-01-02", tags: ["a", "b"] };
  assert.deepEqual(data(stringifyFrontmatter(original)), {
    title: "周会: 第 3 期",
    date: "2026-01-02",
    tags: ["a", "b"],
  });
});

test("往返：数字和布尔回来是字符串（前端拿到的元数据永远是文本）", () => {
  assert.deepEqual(data(stringifyFrontmatter({ n: 42, b: false })), { n: "42", b: "false" });
});

test("往返：空数组退化成空字符串而不是数组（实测缺陷，setFrontmatterTags 用 `[]` 绕开了它）", () => {
  const written = stringifyFrontmatter({ tags: [] });
  assert.equal(written, "---\ntags:\n---\n");
  assert.equal(data(written).tags, "", "空数组写出去后读回来是 ''，不是 [] —— 与 tags: [] 不等价");
});

test("值里带换行会把 YAML 写坏，重新解析时数据丢失（实测缺陷，当前不可达）", () => {
  const written = stringifyFrontmatter({ title: "a\nb" });
  assert.equal(written, "---\ntitle: a\nb\n---\n");
  assert.equal(data(written).title, "a", "第二行 'b' 没有冒号被丢掉 —— 元数据静默截断");

  // 为什么放着不修（2026-10-03 复核）：整条链在应用里走不到。
  // 应用写 frontmatter 只走 setFrontmatterTags / setFrontmatterAliases
  //   → setFrontmatterList（src/App.tsx:1322/1325），那条路刻意**不**用
  //     stringifyFrontmatter，作者在 frontmatter.ts:116 写明了原因：
  //     裸值序列化会把 `title: 会议: 周一` 这类写坏。
  // 而 mergeFrontmatter（stringifyFrontmatter 的唯一调用方）在 src/ 里零调用方。
  // 所以这是个**导出但没人用**的函数上的潜伏缺陷。修它要成对改
  // 序列化与解析（引号转义），风险大于收益 —— 与 math 的椭圆求交同理，
  // 不是"改不了"，是"改了动的是一条当前没人走的路"。
  // 一旦有人开始调 mergeFrontmatter，先把这条用例反过来读。
});

test("嵌套对象被写成 '[object Object]'（不支持嵌套，已知限制）", () => {
  assert.equal(stringifyFrontmatter({ a: { x: 1 } }), "---\na: [object Object]\n---\n");
});

/* ───────────────────────── extractTagsSmart ───────────────────────── */

test("frontmatter 的 tags 数组优先，正文里的 #标签 不参与", () => {
  assert.deepEqual(extractTagsSmart("---\ntags: [b, a]\n---\n#other"), ["b", "a"]);
});

test("frontmatter 的 tags 去重但保持书写顺序", () => {
  assert.deepEqual(extractTagsSmart("---\ntags:\n  - b\n  - a\n  - b\n---\nB"), ["b", "a"]);
});

test("frontmatter 的 tags 是标量时当单个标签，不按空格拆", () => {
  assert.deepEqual(extractTagsSmart("---\ntags: a b\n---\nB"), ["a b"]);
  assert.deepEqual(extractTagsSmart("---\ntags: 阅读\n---\nB"), ["阅读"]);
});

test("frontmatter 没有 tags 字段时 fallback 到正文 #标签", () => {
  assert.deepEqual(extractTagsSmart("#x #y"), ["x", "y"]);
});

test("`tags: []` 是数组，不再 fallback 正文 —— 空数组表示明确没有标签", () => {
  assert.deepEqual(extractTagsSmart("---\ntags: []\n---\n#zed #abc"), []);
});

test("`tags:`（空值）读成空串，会 fallback 正文标签", () => {
  assert.deepEqual(extractTagsSmart("---\ntags:\n---\n#x"), ["x"]);
});

test("正文标签排序输出，并剥掉两头的括号/逗号/感叹号", () => {
  assert.deepEqual(extractTagsSmart("先 #b 后 #a\n( #c) , #a"), ["a", "b", "c"]);
});

test("正文标签 19 字留下、20 字丢掉（上限按字符数算，且是 < 20）", () => {
  const out = extractTagsSmart("#" + "a".repeat(19) + " #" + "b".repeat(20));
  assert.deepEqual(out, ["a".repeat(19)]);
});

test("ATX 标题行 `# Heading` 不算标签（井号后有空格）", () => {
  assert.deepEqual(extractTagsSmart("# Heading\n#real"), ["real"]);
});

test("多个井号会被剥掉；只剩标点的词直接丢弃", () => {
  assert.deepEqual(extractTagsSmart("##x\n#"), ["x"]);
  assert.deepEqual(extractTagsSmart("# ---"), []);
});

test("正文标签跨行去重", () => {
  assert.deepEqual(extractTagsSmart("#a\n#a #b"), ["a", "b"]);
});

test("行内标签剥离 CJK 标点，保留连字符与下划线", () => {
  assert.deepEqual(extractTagsSmart("#读书。 #tag- #a_b"), ["a_b", "tag-", "读书"].sort());
});

/* ────────────────────────── extractTitle ────────────────────────── */

test("剥掉 ATX 标题前缀，正文第一行有内容就是标题", () => {
  assert.equal(extractTitle("# Hello\n正文"), "Hello");
  assert.equal(extractTitle("## 二级"), "二级");
  assert.equal(extractTitle("###### 六级"), "六级");
});

test("井号后没有空白的 `#标签` 原样当标题（不剥）", () => {
  assert.equal(extractTitle("#标签\n正文"), "#标签");
});

test("7 个及以上井号不算标题", () => {
  assert.equal(extractTitle("####### x"), "####### x");
});

test("空行和只写了井号的行跳过，取后面第一条有内容的行", () => {
  assert.equal(extractTitle("\n\n  \n#\n真正标题"), "真正标题");
});

test("frontmatter 里的 title 不参与，标题只从正文取", () => {
  assert.equal(extractTitle("---\ntitle: 元数据标题\n---\n# 正文标题"), "正文标题");
});

test("超 50 字符按字符数截断并加省略号（中文同样按字算）", () => {
  assert.equal(extractTitle("x".repeat(60)), "x".repeat(50) + "...");
  assert.equal(extractTitle("中".repeat(60)), "中".repeat(50) + "...");
});

test("恰好 50 字符不截断也不加省略号", () => {
  assert.equal(extractTitle("y".repeat(50)), "y".repeat(50));
});

test("整篇没有内容时返回 '无标题笔记'", () => {
  assert.equal(extractTitle(""), "无标题笔记");
  assert.equal(extractTitle("\n\n   \n"), "无标题笔记");
});

/* ───────── stripFrontmatter / frontmatterBlock / withFrontmatter ───────── */

test("stripFrontmatter 只留正文，前导空行照留", () => {
  assert.equal(stripFrontmatter("---\ntitle: x\n---\n\n正文\n"), "\n正文\n");
  assert.equal(stripFrontmatter("只有正文"), "只有正文");
});

test("frontmatterBlock 原样切出头块（含闭合 --- 那行的换行）", () => {
  const raw = "---\ntitle: x\ntags:\n  - a\n---\n\n正文\n";
  assert.equal(frontmatterBlock(raw), "---\ntitle: x\ntags:\n  - a\n---\n");
  assert.equal(raw.slice(frontmatterBlock(raw).length), "\n正文\n");
});

test("frontmatterBlock 对 CRLF 文档同样能切出来", () => {
  assert.equal(frontmatterBlock("---\r\ntitle: x\r\n---\r\n正文"), "---\r\ntitle: x\r\n---\r\n");
});

test("没有 frontmatter 时 frontmatterBlock 返回空串", () => {
  assert.equal(frontmatterBlock("正文"), "");
  assert.equal(frontmatterBlock("---\n---\n正文"), "", "空 fm 块不被识别，所以也算没有");
});

test("withFrontmatter 给裸正文补回头块", () => {
  const raw = "---\ntitle: x\n---\n\n正文\n";
  assert.equal(withFrontmatter(raw, "新正文"), "---\ntitle: x\n---\n新正文");
});

test("withFrontmatter 已经带头时不重复前插（编辑器回写整篇原文的路径）", () => {
  const raw = "---\ntitle: x\n---\n\n正文\n";
  assert.equal(withFrontmatter(raw, raw), raw);
});

test("withFrontmatter 对没有 frontmatter 的原文是 no-op", () => {
  assert.equal(withFrontmatter("正文", "新正文"), "新正文");
  assert.equal(withFrontmatter("正文", ""), "");
});

/* ────────────────────────── mergeFrontmatter ────────────────────────── */

test("更新已有字段：覆盖取值，位置不变", () => {
  const raw = "---\ntitle: x\ntags:\n  - a\n---\n\n正文\n";
  assert.equal(mergeFrontmatter(raw, { title: "new" }), "---\ntitle: new\ntags:\n  - a\n---\n\n正文\n");
});

test("新增字段追加到 YAML 末尾，原有字段顺序不变", () => {
  const raw = "---\ntitle: x\ntags:\n  - a\n---\n正文";
  assert.equal(
    mergeFrontmatter(raw, { title: "y", z: 1 }),
    "---\ntitle: y\ntags:\n  - a\nz: 1\n---\n正文",
  );
});

test("merge 之后再 parse 能拿回同口径数据（往返不断）", () => {
  const raw = "---\ntitle: x\ntags:\n  - a\n---\n\n正文\n";
  const merged = mergeFrontmatter(raw, { title: "new" });
  assert.deepEqual(data(merged), { title: "new", tags: ["a"] });
  assert.equal(body(merged), "\n正文\n");
});

test("没有 frontmatter 时 merge 会在最前面补一块", () => {
  assert.equal(mergeFrontmatter("正文", { title: "x" }), "---\ntitle: x\n---\n正文");
});

test("用 undefined 覆盖会把字段写成空值 key 而不是删掉（实测行为）", () => {
  assert.equal(mergeFrontmatter("---\ntitle: x\n---\nB", { title: undefined }), "---\ntitle:\n---\nB");
});
