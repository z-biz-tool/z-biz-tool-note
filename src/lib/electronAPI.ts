// Tauri API 桥接层
// 在 Tauri 环境中使用 invoke 调用 Rust 命令，浏览器中使用 localStorage 回退

import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { sanitizeExport } from './sanitize';
import { promptDialog } from './dialogs';
import { isMarkdownPath, kindOf } from './fileTypes';
import { extractTagsSmart, extractTitle, stripFrontmatter } from './frontmatter';
import { Marked } from 'marked';

// 不能用全局 marked：@tiptap/markdown 在初始化时对这个共享实例 marked.use(...) 注册了自己的
// taskList 等 tokenizer，直接 marked.parse('- [x] 完成') 实测抛
// `Token with "taskList" type was not found`。开一个不受影响的实例。
const exportMarked = new Marked({ gfm: true, breaks: true });

// 检测是否运行在 Tauri 环境
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 桥层的错误约定：Rust 侧报错时返回 {success:false,error} 而不是抛异常，好让每个通道
 * 都能给 UI 一个统一形状。代价是调用点的 try/catch 形同虚设 —— 需要区分"真写进去了"
 * 和"没写进去"的地方（保存、改名、删除）必须先用这个函数把失败还原成异常，否则会走
 * 成功分支：清掉 WAL、toast「已保存」，而盘上其实一个字都没写。
 */
export function mustSucceed<T>(result: T): T {
  const r = result as unknown as { success?: boolean; error?: string } | null;
  if (r && r.success === false) throw new Error(r.error || '操作失败');
  return result;
}

/**
 * 拼进 toast/错误行的错误文案：抛出来的是 Error，直接 ${e} 会带上 "Error: " 前缀，
 * 而这条往往是用户唯一看得到的原因，得干净可读（也是 mustSucceed 那条约定的对端）。
 */
export const errText = (e: unknown): string =>
  String((e as Error | null)?.message || e || '未知错误').slice(0, 60);

/**
 * 前端 AIConfig（驼峰 baseURL）→ Rust AiConfigPayload（snake_case base_url）。
 * ai-chat / ask-notes 两个通道共用；字段名错位会让 serde 报 missing field，
 * 且报错出现在 Rust 反序列化层，调用方完全看不出是自己传错了键名。
 */
function toAiPayload(cfg: unknown): { base_url: string; api_key: string; model: string } {
  const c = (cfg ?? {}) as Record<string, unknown>;
  return {
    base_url: String(c.baseURL ?? c.base_url ?? ''),
    api_key: String(c.apiKey ?? c.api_key ?? ''),
    model: String(c.model ?? ''),
  };
}

// 对话框插件（懒加载，可能不可用）
let _dialogLoaded = false;
let dialogSave: ((opts: any) => Promise<string | string[] | null>) | null = null;
let dialogOpen: ((opts: any) => Promise<string | string[] | null>) | null = null;
async function loadDialog() {
  if (_dialogLoaded) return;
  _dialogLoaded = true;
  try {
    const dialog = await import('@tauri-apps/plugin-dialog');
    dialogSave = dialog.save;
    dialogOpen = dialog.open;
  } catch (e) {
    console.debug('对话框插件不可用，使用 fallback:', e);
  }
}

/**
 * 浏览器演示工作区：没有 Tauri 后端时也能把整棵 App 跑起来
 * （文件树 / 编辑器 / 标签页 / 搜索 / 弹窗 / 重命名 / 删除都能在浏览器里实测）
 *
 * 路径表存在 demoFs、正文存在 note-<path>，这样"新建/改名/删除"才真的改变工作区形态；
 * 之前是一份写死的文件清单，Sidebar 的这几个命令在浏览器里既跑不了也没法验证。
 */
const DEMO_DIR = 'demo';
const DEMO_FS_KEY = 'demoFs';

interface DemoFs { files: string[]; dirs: string[] }

const demoSeedContents: Record<string, string> = {
  'demo/Welcome.md': '# Welcome\n\n这是浏览器演示区，用于在没有 Tauri 后端时验证界面与交互。\n\n## 目录\n\n- [[Getting Started]]\n- [[Code]]\n- [[Tables]]\n\n## 待办\n\n- [ ] 试试 Cmd+K 跳到搜索框\n- [ ] 试试 Cmd+, 打开设置\n',
  'demo/Getting Started.md': '# Getting Started\n\n按 Cmd+Shift+P 打开命令面板，输入「设置」可以直接进设置页。\n\n正文里可以引用 [[Welcome]]，反链面板会把它认出来。\n\n标签：demo\n',
  'demo/Examples/Code.md': '# Code\n\n行内代码用反引号包裹即可，代码块三反引号起头。\n\n    export const greet = (name: string) => `你好，${name}`;\n',
  'demo/Examples/Tables.md': '# Tables\n\n| 场景 | 命令 | 说明 |\n| --- | --- | --- |\n| 搜索 | Cmd+K | 跳到侧栏搜索框 |\n| 设置 | Cmd+, | 打开设置弹窗 |\n',
  // 一篇 .markdown：Rust 侧 read_all_notes / search_in_files 现在按 commands::is_markdown_path
  // 两种扩展名一起收，演示区要能验证同一条口径（改之前这篇整份进不了图谱和搜索）
  'demo/Changelog.markdown': '# Changelog\n\n标签：demo\n\n.markdown 后缀的笔记和 .md 同等对待：能搜到、进图谱、有反链。\n引用 [[Welcome]] 用来验证 .markdown 文件里的双链被索引。\n',
  // 一篇带 YAML 头的笔记：标题取自正文第一行（不是文件名、更不是 `---`），
  // 标签来自 frontmatter 的块列表，正文里的 #顺手写的标签 不再参与（frontmatter 优先）。
  'demo/读书笔记.md': '---\ntags:\n  - reading\n  - 长期计划\n---\n读书笔记：这篇带 YAML 头，标题取正文第一行。\n\n正文里的 #顺手写的标签 不该出现在标签页。\n引用 [[Welcome]] 验证带 frontmatter 的笔记也进图谱。\n',
};

function demoFs(): DemoFs {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_FS_KEY) || 'null');
    if (saved && Array.isArray(saved.files) && Array.isArray(saved.dirs)) return saved as DemoFs;
  } catch (e) {
    // 演示区数据损坏就按种子重建；先留痕，否则用户会以为自己的演示笔记凭空消失
    console.warn('[demo] 演示文件树读取失败，已重建种子数据:', e);
  }
  const seed: DemoFs = { files: Object.keys(demoSeedContents), dirs: [`${DEMO_DIR}/Examples`] };
  localStorage.setItem(DEMO_FS_KEY, JSON.stringify(seed));
  return seed;
}

function saveDemoFs(fs: DemoFs) {
  localStorage.setItem(DEMO_FS_KEY, JSON.stringify(fs));
}

const demoContentOf = (path: string) =>
  localStorage.getItem(`note-${path}`) ?? demoSeedContents[path] ?? '';

const demoIsDir = (path: string) => {
  const fs = demoFs();
  return fs.dirs.includes(path) || fs.files.some(f => f.startsWith(`${path}/`));
};

/** 单层列目录：目录不带 children，与 Rust list_dir 一致（Sidebar 展开时按需再拉） */
function demoFilesIn(dir: unknown): any[] {
  const root = !dir || dir === DEMO_DIR ? DEMO_DIR : String(dir);
  const prefix = `${root}/`;
  const out = new Map<string, any>();
  const fs = demoFs();
  for (const p of fs.files) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    if (slash < 0) out.set(rest, { name: rest, path: p, isDirectory: false, isFile: true });
    else {
      const name = rest.slice(0, slash);
      if (!out.has(name)) out.set(name, { name, path: `${prefix}${name}`, isDirectory: true, isFile: false });
    }
  }
  for (const d of fs.dirs) {
    if (!d.startsWith(prefix)) continue;
    const name = d.slice(prefix.length).split('/')[0];
    if (name && !out.has(name)) out.set(name, { name, path: `${prefix}${name}`, isDirectory: true, isFile: false });
  }
  return [...out.values()];
}

/** 递归列目录：App 的 allFiles（双链解析靠它）会顺着 children 走到底 */
function demoFilesRecursive(dir: unknown): any[] {
  return demoFilesIn(dir).map(item =>
    item.isDirectory ? { ...item, children: demoFilesRecursive(item.path) } : item
  );
}

/** 改名：路径表和正文都要跟着搬，否则点开改名后的笔记是空的 */
function demoRename(oldPath: string, newPath: string) {
  const fs = demoFs();
  if (demoIsDir(oldPath)) {
    const re = (p: string) => (p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p);
    // 子文件的正文可能只挂在种子表的老路径上，改名后必须先按老路径读出来再挂到新路径
    for (const p of fs.files.filter(p => p.startsWith(`${oldPath}/`))) {
      localStorage.setItem(`note-${re(p)}`, demoContentOf(p));
      localStorage.removeItem(`note-${p}`);
    }
    fs.files = fs.files.map(re);
    fs.dirs = fs.dirs.map(re);
  } else {
    fs.files = fs.files.map(p => (p === oldPath ? newPath : p));
    localStorage.setItem(`note-${newPath}`, demoContentOf(oldPath));
    localStorage.removeItem(`note-${oldPath}`);
  }
  saveDemoFs(fs);
}

/** 移到废纸篓：路径表和正文一起摘掉，之后在同一位置新建笔记才不会被旧正文污染 */
function demoTrash(path: string) {
  const fs = demoFs();
  const gone = (p: string) => !(p === path || p.startsWith(`${path}/`));
  for (const p of fs.files.filter(p => !gone(p))) localStorage.removeItem(`note-${p}`);
  fs.files = fs.files.filter(gone);
  fs.dirs = fs.dirs.filter(gone);
  saveDemoFs(fs);
}

/** 演示工作区里的"磁盘时间"与备份库 */
const DEMO_MTIME_KEY = 'demoMtimes';
const DEMO_BACKUP_KEY = 'demoBackups';
const DEMO_BACKUP_HOME = '~/.z-note/backups';
const BACKUP_KEEP = 20;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 与 Rust chrono 的 "%Y-%m-%d %H:%M:%S" 同格式：状态栏「已保存 HH:MM」按空格切第二段取值 */
function demoStamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} `
    + `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** 与 create_backup 的备份文件名 "%Y%m%d_%H%M%S" 同格式 */
const demoBackupStamp = (d: Date) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  + `_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;

/**
 * mtime 字符串的格式真源：Rust 侧 get_file_modified/list_backups 都返回 chrono 的
 * "%Y-%m-%d %H:%M:%S"，状态栏「已保存 HH:MM」按空格切第二段取值。调用方需要自己
 * 打一个时间戳（拿不到盘上 mtime 时的兜底）就用它，别再各写一份格式化。
 */
export const formatMtime = (d: Date = new Date()): string => demoStamp(d);

function demoMtimeMap(): Record<string, string> {
  try {
    const m = JSON.parse(localStorage.getItem(DEMO_MTIME_KEY) || '{}');
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

/**
 * localStorage 没有 mtime，所以每次写盘自己打一个戳。从没写过的种子文件首次被问到时
 * 也按"现在"记一笔并固定下来 —— 不记的话每次查都在跳，状态栏和外部修改检测都没法验证。
 */
function demoMtimeOf(path: string): string {
  const m = demoMtimeMap();
  if (m[path]) return m[path];
  m[path] = demoStamp(new Date());
  localStorage.setItem(DEMO_MTIME_KEY, JSON.stringify(m));
  return m[path];
}

interface DemoBackup { path: string; notePath: string; content: string; modified: string }

function demoBackupList(): DemoBackup[] {
  try {
    const v = JSON.parse(localStorage.getItem(DEMO_BACKUP_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const demoBackupPathOf = (notePath: string, stamp: string) =>
  `${DEMO_BACKUP_HOME}/${notePath.replace(/[\/\\]/g, '_')}/${stamp}.md`;

/** 形状与 Rust 对齐（同一目录名规则、同一时间戳格式、同样只留最近 20 份），否则 UI 两种模式读到的不是同一份契约 */
function demoCreateBackup(notePath: string, content: string) {
  const now = new Date();
  const path = demoBackupPathOf(notePath, demoBackupStamp(now));
  // 同一秒内的两次保存文件名相同，Rust 那边就是覆盖写，这里也不额外去重
  const all = [...demoBackupList().filter(b => b.path !== path), { path, notePath, content, modified: demoStamp(now) }];
  const mine = all.filter(b => b.notePath === notePath).sort((a, b) => a.path.localeCompare(b.path));
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - BACKUP_KEEP)).map(b => b.path));
  localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(all.filter(b => !drop.has(b.path))));
}

const demoBackupOf = (path: string) => demoBackupList().find(b => b.path === path) || null;

/** 与 list_backups 同形状同排序（modified 降序） */
function demoListBackups(notePath: string) {
  return demoBackupList()
    .filter(b => b.notePath === notePath)
    .map(b => ({ path: b.path, timestamp: b.path.split('/').pop()!.replace(/\.md$/, ''), modified: b.modified }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** 写正文 + 保证路径表里有它：write-file / write-text-file / 恢复备份共用一条落盘路径 */
function demoWrite(path: string, content: string) {
  localStorage.setItem(`note-${path}`, content);
  const fs = demoFs();
  if (!fs.files.includes(path)) {
    fs.files.push(path);
    saveDemoFs(fs);
  }
  const m = demoMtimeMap();
  m[path] = demoStamp(new Date());
  localStorage.setItem(DEMO_MTIME_KEY, JSON.stringify(m));
}

/** 演示工作区里的"笔记"：与 Rust read_all_notes/search_in_files 同一条口径，非笔记文件不参与索引 */
const demoNoteFiles = () => demoFs().files.filter(p => isMarkdownPath(p));

/** 与 Rust read_all_notes 同构的摘要，让标签 / 图谱 / 反链在浏览器里也能验证 */
function demoNoteSummaries() {
  return demoNoteFiles().map(filePath => {
    const content = demoContentOf(filePath);
    return {
      filePath,
      content,
      // 标题和标签都走 frontmatter.ts 里那套（跟 Rust extract::extract_* 同口径）：
      // 自己在这儿拼正则的话，带 YAML 头的笔记就会显示成 `---`、frontmatter 里的
      // tags 也永远进不了侧栏标签页，浏览器里看到的跟 Tauri 里跑的不是同一套规则。
      title: extractTitle(content),
      tags: extractTagsSmart(content),
      links: [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim()),
    };
  });
}

/**
 * 按 id 取一篇笔记，对应 Rust 的 `read_note`（那边是 `~/.z-note/notes/{id}.md`）。
 * 演示区没有那份旧存储 —— 工作区里的 .md 文件就是笔记本体，所以同一条语义落成
 * "文件名剥掉 markdown 后缀等于 id"。返回 null 表示没这篇，与 Rust 的 `Option::None`
 * 对齐：不能退化成空串，否则 UI 分不清"写错了 id"和"这篇本来就是空的"。
 */
function demoNoteById(id: unknown): string | null {
  const key = String(id ?? '').trim();
  if (!key) return null;
  const files = demoNoteFiles();
  const hit = files.find(p => (p.split('/').pop() || '').replace(/\.(md|markdown)$/i, '') === key)
    || files.find(p => p === key);
  return hit ? demoContentOf(hit) : null;
}

/** 演示工作区的暴力搜索，产出与 Rust 一致的结构（preview 里用 <mark> 包命中词） */
function demoSearch(query: unknown) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const out: { filePath: string; line: number; preview: string }[] = [];
  for (const filePath of demoNoteFiles()) {
    const content = demoContentOf(filePath);
    content.split('\n').forEach((line, i) => {
      if (out.length >= 50) return;
      const at = line.toLowerCase().indexOf(q);
      if (at < 0) return;
      const from = Math.max(0, at - 20);
      out.push({
        filePath,
        line: i + 1,
        preview: escapeHtml(line.slice(from, at))
          + `<mark>${escapeHtml(line.slice(at, at + q.length))}</mark>`
          + escapeHtml(line.slice(at + q.length, at + q.length + 40)),
      });
    });
  }
  return out;
}

// HTML 特殊字符转义（防止 XSS）
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 反向链接，逐条对齐 Rust find_backlinks：只在 Markdown 笔记里找 `[[标题]]` / `[[标题#锚点]]`，
 * 一个文件最多出一条（Rust 侧靠 found 标志位），预览取命中行的前 100 个字符。
 * 浏览器回退原先固定返回空数组，等于反链面板在演示区里永远是空的 —— 面板改没改对，
 * 不开 Tauri 就根本无从验证，所以这里补齐同一条口径而不是继续糊一个 [] 。
 */
function demoBacklinks(dir: unknown, noteTitle: unknown, notePath: unknown) {
  const title = String(noteTitle ?? '');
  const self = String(notePath ?? '');
  const root = String(dir ?? '');
  const out: { noteId: string; title: string; preview: string }[] = [];
  if (!title) return out;
  for (const filePath of demoFs().files) {
    if (!isMarkdownPath(filePath)) continue;
    if (root && filePath !== root && !filePath.startsWith(`${root}/`)) continue;
    if (filePath === self) continue;
    const content = demoContentOf(filePath);
    for (const line of content.split('\n')) {
      const at = line.indexOf(`[[${title}`);
      if (at < 0) continue;
      const after = line.slice(at + 2);
      const end = after.indexOf(']]');
      if (end < 0) continue;
      const link = after.slice(0, end);
      if (link !== title && !link.startsWith(`${title}#`)) continue;
      const chars = [...line];
      out.push({
        noteId: filePath,
        title: extractTitle(content),
        preview: chars.length > 100 ? `${chars.slice(0, 100).join('')}...` : line,
      });
      break;
    }
  }
  return out;
}

// 将 Rust FileEntry 的 snake_case 字段（is_dir/is_file）归一化为前端 FileItem 的 camelCase 字段（isDirectory/isFile）。
// 单层列目录时 children 为空数组，转为 undefined 以便 Sidebar 通过 !file.children 触发按需加载
function normalizeFileEntry(entry: any): any {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    isDirectory: entry.isDirectory ?? entry.is_dir ?? false,
    isFile: entry.isFile ?? entry.is_file ?? false,
    children: Array.isArray(entry.children) && entry.children.length > 0
      ? entry.children.map(normalizeFileEntry)
      : undefined,
  };
}

// 将 Markdown 内容转换为完整 HTML 文档
function generateHtmlFromContent(content: string): string {
  // 整篇交给 marked —— 与编辑器同一个 markdown 口径。原来是逐行 if-else 的假转换器：
  // 代码围栏变成 <p>```</p>、表格变成一摊竖线、列表项是裸 &lt;li&gt;，
  // 而且 YAML 头也当正文渲染进文档（实测导出件开头就是 <hr/><p>tags:</p><li>reading</li>）。
  // 说明：正文里的原始 HTML 会原样带过去（marked 默认行为，与 pandoc / Obsidian 导出一致），
  // 内容本来就是用户自己的笔记文件；敏感信息仍由 sanitizeExport 先抹掉。
  const body = stripFrontmatter(content || '');
  const htmlContent = exportMarked.parse(body, { async: false }) as string;
  const title = extractTitle(content || '') || 'ZenNote 导出';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#333}
h1,h2,h3{margin-top:1.5em}blockquote{border-left:3px solid #ddd;padding-left:1em;color:#666}
code{background:#f5f5f5;padding:2px 4px;border-radius:3px}hr{border:none;border-top:1px solid #ddd;margin:2em 0}
li{margin:0.3em 0}pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto}
pre code{background:none;padding:0}table{border-collapse:collapse;margin:1em 0}
th,td{border:1px solid #ddd;padding:6px 10px}th{background:#f5f5f5}
ul ul,ol ol{margin:0}</style></head>
<body>${htmlContent}</body></html>`;
}

/**
 * 导出 HTML 的目标路径。
 *
 * Why: 调用方传进来的一直是**笔记自己的 .md 路径**，而两侧都是"给什么路径就写什么文件"，
 * 于是 Tauri 侧那条 `write_file(path, 一整份 HTML)` 会点一次「导出为 HTML」就把笔记本体
 * 覆盖成 HTML 文档（实测传的确实是 demo/读书笔记.md，toast 也照着念这个名字）。
 * 目标名在这里算一次，两侧共用，浏览器侧也真的落一个 .html 文件，好验证。
 */
export function exportHtmlPath(notePath: string): string {
  const base = (notePath || '').replace(/\.(md|markdown)$/i, '');
  return `${base || 'note'}.html`;
}

/**
 * 哪些附件可以走 asset:// 直链而不是 base64。只有直接把地址塞给 src 的那几个查看器受益；
 * pdf/docx/xlsx 要的是字节本身（pdf.js 与 mammoth/SheetJS 自己解析），给 URL 等于把它们
 * 读文件那步删掉，所以它们继续走 base64。
 */
export const isStreamablePath = (path: string): boolean => {
  const kind = kindOf(path);
  return kind === 'image' || kind === 'video' || kind === 'audio';
};

export const electronAPI = {
  isTauri,
  isElectron: false, // 向后兼容

  // 返回类型显式写成 Promise<any>：各通道返回结构不同（file-exists 甚至是裸 boolean），
  // 让 TS 推导出联合类型会让每个调用点都要重新收窄，反而丢掉检查能力。
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    if (!isTauri) {
      // 浏览器回退
      switch (channel) {
        case 'read-file': {
          // 回退层也得有"文件不存在"这条失败：真实后端会报错，而这里原先对任何路径都返回正文
          // （读不到就是空串），于是列表里一条被外部删掉的笔记会凭空开出一篇空白笔记。
          const path = String(args[0]);
          if (!demoFs().files.includes(path)) {
            // 版本历史的预览读的是 ~/.z-note/backups/ 下的备份文件，它不在工作区路径表里；
            // 真实后端 read_file 照样能读，演示区不跟着读就等于预览永远报"文件不存在"
            const backup = demoBackupOf(path);
            if (backup) return { success: true, content: backup.content, filePath: path };
            return { success: false, error: '文件不存在（浏览器演示区）', filePath: path };
          }
          return { success: true, content: demoContentOf(path), filePath: path };
        }
        case 'read-file-binary':
          return { success: false, error: '浏览器模式不可用' };
        case 'get-file-meta':
          return { success: true, size: 0, modified: new Date().toISOString(), mime: 'application/octet-stream', filePath: args[0] };
        case 'write-file': {
          demoWrite(String(args[0]), args[1]);
          return { success: true };
        }
        case 'file-exists': {
          const p = String(args[0]);
          const fs = demoFs();
          return fs.files.includes(p) || fs.dirs.includes(p);
        }
        case 'ensure-dir': {
          const fs = demoFs();
          const dir = String(args[0]);
          if (!fs.dirs.includes(dir)) fs.dirs.push(dir);
          saveDemoFs(fs);
          return { success: true };
        }
        case 'write-text-file':
          demoWrite(String(args[0]), args[1]);
          return { success: true };
        case 'get-file-modified': {
          const p = String(args[0]);
          // 与 Rust 一致：文件不存在是错误，不是"空字符串时间"，否则调用方会拿一个假 mtime 去比
          if (!demoFs().files.includes(p) && !demoBackupOf(p)) {
            return { success: false, error: `获取文件信息失败: 文件不存在 ${p}` };
          }
          return demoMtimeOf(p);
        }
        case 'create-backup':
          demoCreateBackup(String(args[0]), String(args[1]));
          return { success: true };
        case 'list-backups':
          return { success: true, backups: demoListBackups(String(args[0])) };
        case 'restore-backup': {
          const backupPath = String(args[0]);
          const b = demoBackupOf(backupPath);
          if (!b) return { success: false, error: `备份文件不存在: ${backupPath}` };
          demoWrite(String(args[1]), b.content);
          return { success: true };
        }
        case 'rename-file':
          demoRename(String(args[0]), String(args[1]));
          return { success: true };
        case 'move-to-trash':
          demoTrash(String(args[0]));
          return { success: true };
        case 'show-save-dialog': {
          const name = await promptDialog({
            title: '另存为',
            defaultValue: args[0]?.split('/').pop() || 'untitled.md',
            confirmText: '保存',
            validate: v => (!v ? '文件名不能为空' : /[/\\:*?"<>|]/.test(v) ? '文件名不能包含这些字符' : null),
          });
          return name ? { canceled: false, filePath: name } : { canceled: true };
        }
        case 'show-open-dialog':
          // 浏览器没有原生目录选择器，直接给出演示工作区
          return { canceled: false, filePath: DEMO_DIR };
        case 'list-files':
          return { success: true, files: demoFilesIn(args[0]) };
        case 'list-files-recursive':
          return { success: true, files: demoFilesRecursive(args[0]) };
        case 'export-html': {
          // 以前浏览器侧只 return html、不写文件，却把 filePath 原样报回去 —— toast 于是
          // 指着 .md 说"已导出 HTML"。现在两侧形状一致：都写到 .html、都脱敏。
          const content = args[0] as string;
          const target = exportHtmlPath(String(args[1] || ''));
          const fullHtml = generateHtmlFromContent(sanitizeExport(content));
          demoWrite(target, fullHtml);
          return { success: true, html: fullHtml, filePath: target };
        }
        case 'export-pdf': {
          const content = args[0] as string;
          const fullHtml = generateHtmlFromContent(content);
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(fullHtml);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); printWindow.close(); };
          }
          return { success: true, filePath: '' };
        }
        case 'search-in-files':
          return { success: true, matches: demoSearch(args[1]) };
        case 'read-file-stats':
          return { success: true, stats: { size: 0, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), isFile: true, isDirectory: false } };
        case 'open-file-in-finder':
          return { success: false, error: '浏览器模式不可用' };
        case 'save-image':
          return { success: false, error: '浏览器模式没有笔记图库' };
        case 'read-all-notes':
          return { success: true, notes: demoNoteSummaries() };
        case 'find-backlinks':
          return { success: true, backlinks: demoBacklinks(args[0], args[1], args[2]) };
        case 'read-note':
          return { success: true, content: demoNoteById(args[0]) };
        // 笔记图库（notes_dir/images）是 Tauri 侧的东西，演示区的正文一律以 base64 存，
        // 所以这条在浏览器里必然走失败分支 —— 失败形状两侧一致，UI 才敢直接说原因。
        case 'read-image':
          return { success: false, error: '浏览器模式没有笔记图库' };
        // FTS5 搜索索引（search_notes / index_status / rebuild_index / index_upsert_note /
        // index_delete_note）是 Rust + SQLite 的东西，演示区没有索引库。
        // 这五条以前是 searchIndex.ts 里裸调 invoke()：绕开了桥层这唯一出口。
        // 现在两侧都回 {success:false}，调用方继续按"拿不到就降级全盘扫描"处理。
        case 'search-notes':
        case 'index-status':
        case 'rebuild-index':
        case 'index-upsert-note':
        case 'index-delete-note':
          return { success: false, error: '浏览器模式没有搜索索引' };
        case 'ai-chat':
          return { success: false, error: '浏览器模式不可用' };
        case 'ask-notes':
        case 'rag-status':
          return { success: false, error: '浏览器模式没有检索索引' };
        // 流式通道：正文走 Tauri 事件（ai-stream://token / done / error），
        // 浏览器演示区没有事件通道 ⇒ 同样不可用（调用方会退回整段模式）。
        case 'ai-chat-stream':
          return { success: false, error: '浏览器模式不可用' };
        // 预设列表纯本地数据（来自 Rust 常量表），演示区没有 Rust ⇒ 空列表，
        // 设置页会退回手填地址，不假装「一家都没有」。
        case 'list-llm-presets':
          return { success: true, presets: [] };
        case 'list-llm-models':
        case 'test-ai-config':
          return { success: false, error: '浏览器演示区不发真实请求' };
        // 系统密钥库通道：浏览器演示区没有 keychain，密钥只在会话内存里有效，
        // 绝不退回 localStorage —— 那把明文写回去，正是这次迁移要消灭的东西。
        case 'save-secret':
        case 'load-secret':
        case 'delete-secret':
          return { success: false, error: '浏览器演示模式没有系统密钥库，密钥不会被保存' };
        default:
          return { success: false, error: '浏览器模式不可用' };
      }
    }

    // Tauri invoke 调用
    try {
      switch (channel) {
        case 'read-file': {
          const content = await invoke<string>('read_file', { path: args[0] });
          return { success: true, content, filePath: args[0] };
        }
        case 'read-file-binary': {
          // 大文件（>5MB）改用 asset:// 协议流式加载，避免 base64 内存爆炸
          const filePath = args[0] as string;
          let size = 0;
          try {
            const meta = await invoke<{ size: number }>('get_file_meta', { path: filePath });
            size = meta.size;
          } catch (e) {
            // 量不到大小就按"小文件"走 base64：功能仍可用，但内存代价可能变高
            console.warn('[note] 读取文件大小失败，按非流式方式加载:', filePath, e);
          }
          if (size > 5 * 1024 * 1024 && isStreamablePath(filePath)) {
            // 大文件：返回 asset URL，前端用 <video>/<img>/<audio> 直接加载
            return {
              success: true,
              base64: '',
              filePath,
              assetUrl: convertFileSrc(filePath),
              streamed: true,
            };
          }
          const base64 = await invoke<string>('read_file_binary', { path: filePath });
          return { success: true, base64, filePath };
        }
        case 'get-file-meta': {
          const meta = await invoke<{ size: number; modified: string; mime: string }>('get_file_meta', { path: args[0] });
          return { success: true, ...meta, filePath: args[0] };
        }
        case 'write-file': {
          await invoke('write_file', { path: args[0], content: args[1] });
          return { success: true };
        }
        case 'show-save-dialog': {
          await loadDialog();
          if (dialogSave) {
            const result = await dialogSave({ defaultPath: args[0] });
            const filePath = Array.isArray(result) ? result[0] : result;
            return filePath ? { canceled: false, filePath } : { canceled: true };
          }
          const name = await promptDialog({
            title: '另存为',
            defaultValue: args[0]?.split('/').pop() || 'untitled.md',
            confirmText: '保存',
            validate: v => (!v ? '文件名不能为空' : /[/\\:*?"<>|]/.test(v) ? '文件名不能包含这些字符' : null),
          });
          return name ? { canceled: false, filePath: name } : { canceled: true };
        }
        case 'show-open-dialog': {
          await loadDialog();
          if (dialogOpen) {
            const result = await dialogOpen({ directory: true });
            const filePath = Array.isArray(result) ? result[0] : result;
            return filePath ? { canceled: false, filePath } : { canceled: true };
          }
          return { canceled: true };
        }
        case 'list-files': {
          const files = await invoke<any[]>('list_dir', { path: args[0] });
          return { success: true, files: (files || []).map(normalizeFileEntry) };
        }
        case 'list-files-recursive': {
          const files = await invoke<any[]>('list_dir_recursive', { path: args[0] });
          return { success: true, files: (files || []).map(normalizeFileEntry) };
        }
        case 'export-html': {
          // 直接将内容导出为 HTML 文件；默认脱敏（移除 API Key、用户名等敏感信息）
          // 目标路径必须由 exportHtmlPath 从笔记路径换算：调用方给的是 .md，
          // 原样 write_file 会把笔记本身覆盖成 HTML。
          const content = args[0] as string;
          const filePath = args[1] as string;
          const safeContent = sanitizeExport(content);
          const fullHtml = generateHtmlFromContent(safeContent);
          if (filePath) {
            const target = exportHtmlPath(filePath);
            await invoke('write_file', { path: target, content: fullHtml });
            return { success: true, filePath: target };
          }
          return { success: true, html: fullHtml };
        }
        case 'export-pdf': {
          // PDF 导出通过浏览器打印；同样走脱敏
          const content = args[0] as string;
          const safeContent = sanitizeExport(content);
          const fullHtml = generateHtmlFromContent(safeContent);
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(fullHtml);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); printWindow.close(); };
          }
          return { success: true, filePath: '' };
        }
        case 'search-in-files': {
          const matches = await invoke<any[]>('search_in_files', { dir: args[0], query: args[1] });
          return { success: true, matches };
        }
        // 索引类：形状统一成 {success, ...}，让 searchIndex.ts 不再自己 catch invoke
        case 'search-notes': {
          const results = await invoke<any[]>('search_notes', { query: args[0], limit: args[1] });
          return { success: true, results: results || [] };
        }
        case 'index-status': {
          const status = await invoke<any>('index_status');
          return { success: true, status };
        }
        case 'rebuild-index': {
          const status = await invoke<any>('rebuild_index', { dir: args[0] });
          return { success: true, status };
        }
        case 'index-upsert-note':
          await invoke('index_upsert_note', { path: args[0] });
          return { success: true };
        case 'index-delete-note':
          await invoke('index_delete_note', { path: args[0] });
          return { success: true };
        case 'read-file-stats':
          return { success: true, stats: { size: 0, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), isFile: true, isDirectory: false } };
        case 'open-file-in-finder': {
          // 2026-10-22：后端补上了 show_in_folder（原先这个通道在 Tauri 模式下
          // 直接返回「暂不支持」⇒ 桌面上是个假入口；前端其实也没在用它）。
          const res = await invoke('show_in_folder', { path: String(args[0]) });
          return { success: true, path: res };
        }
        case 'save-image': {
          const relativePath = await invoke<string>('save_image', { noteId: args[0], data: args[1] });
          return { success: true, path: relativePath };
        }
        case 'read-image': {
          // 正文里 src 形如 images/xxx.png 的图要由 Rust 读成 data URI（前端拼不出这个路径）
          const dataUrl = await invoke<string>('read_image', { path: args[0] });
          return { success: true, dataUrl };
        }
        case 'ai-chat': {
          try {
            // 前端 AIConfig 用驼峰 baseURL，Rust AiConfigPayload 是 snake_case base_url。
            // serde 不做大小写转换，之前把对象原样递过去，Rust 侧直接报
            // 「missing field base_url」—— 这条通道一直是断的，2026-10-26 修复。
            const config = toAiPayload(args[0]);
            const content = await invoke<string>('ai_chat', { config, messages: args[1] });
            return { success: true, content };
          } catch (e: any) {
            return { success: false, error: e?.toString() || 'AI 请求失败' };
          }
        }
        // ── AI 服务商预设 / 取模型 / 测连接 ──────────────────────────
        // 预设从 Rust 取（单一事实源在 cap-llm::presets）。前端不再自带
        // 那份写死模型名的快捷表 —— 模型名半年一代，写死必过期。
        case 'list-llm-presets': {
          try {
            const presets = await invoke<any[]>('list_llm_presets');
            return { success: true, presets };
          } catch (e: any) {
            return { success: false, error: e?.toString() || '读取服务商列表失败' };
          }
        }
        // 结构化失败要**原样透传**：Rust 侧 LlmFailure 带 kind/status/hint/focus，
        // 界面靠 focus 决定把光标送进哪一栏。这里若只 retain 一句文本，
        // 分流就退化成「所有错误同一句话」。
        case 'list-llm-models': {
          try {
            const models = await invoke<string[]>('list_llm_models', {
              config: toAiPayload(args[0]),
            });
            return { success: true, models };
          } catch (e: any) {
            return { success: false, error: e?.message || e?.toString() || '获取模型失败', failure: e };
          }
        }
        case 'test-ai-config': {
          try {
            const detail = await invoke<string>('test_ai_config', {
              config: toAiPayload(args[0]),
            });
            return { success: true, detail };
          } catch (e: any) {
            return { success: false, error: e?.message || e?.toString() || '连接失败', failure: e };
          }
        }
        // 问笔记（RAG）：检索与调用都在 Rust 侧（rag + cap-llm），回答经
        // ask://token / ask://done 事件流式到达，这条通道只负责发起与收尾状态。
        case 'ask-notes': {
          try {
            await invoke('ask_notes', {
              question: args[0],
              scope: args[1],
              notePath: args[2],
              config: toAiPayload(args[3]),
            });
            return { success: true };
          } catch (e: any) {
            return { success: false, error: e?.toString() || '问笔记失败' };
          }
        }
        case 'rag-status': {
          try {
            const s = await invoke<{ notes: number; chunks: number }>('rag_status');
            return { success: true, notes: s.notes, chunks: s.chunks };
          } catch (e: any) {
            return { success: false, error: e?.toString() || '索引状态不可用' };
          }
        }
        // 流式聊天：命令本身**不带正文**，正文走 ai-stream://* 事件。
        // ⚠ resolve 只代表「命令没报错」—— 调用方（src/lib/aiStream.ts）要等
        //   done/error 事件才收尾，不能把 resolve 当成「答完了」。
        case 'ai-chat-stream': {
          try {
            // 这里以前直接把 args[0] 递过去，漏了 toAiPayload —— 而 ai-chat
            // 那条是转过的。serde 不做大小写转换，Rust 侧直接报
            // 「missing field base_url」，表现是流式对话永远失败、
            // 退化成整段请求。两条通道必须用同一个转换函数。
            await invoke('ai_chat_stream', { config: toAiPayload(args[0]), messages: args[1] });
            return { success: true };
          } catch (e: any) {
            return { success: false, error: e?.toString() || 'AI 流式请求失败' };
          }
        }
        // 敏感项（AI API Key 等）走 OS 密钥库：account 为命名空间化 key
        // （"ai.apiKey"），由 Rust secrets::account_for 校验形状。
        case 'save-secret': {
          await invoke('save_secret', { key: args[0], value: args[1] });
          return { success: true };
        }
        case 'load-secret': {
          // value = null 表示还没配过密钥（Rust 返回 Option::None）
          const value = await invoke<string | null>('load_secret', { key: args[0] });
          return { success: true, value: value ?? null };
        }
        case 'delete-secret': {
          await invoke('delete_secret', { key: args[0] });
          return { success: true };
        }
        case 'read-all-notes': {
          const notes = await invoke<any[]>('read_all_notes', { dir: args[0] });
          return { success: true, notes };
        }
        case 'find-backlinks': {
          const result = await invoke<any[]>('find_backlinks', { dir: args[0], noteTitle: args[1], notePath: args[2] });
          // Rust BacklinkEntry 的字段为 file_path/title/preview，前端 Backlink 类型使用 noteId
          const backlinks = (result || []).map((bl: any) => ({
            noteId: bl.file_path,
            title: bl.title,
            preview: bl.preview,
          }));
          return { success: true, backlinks };
        }
        // 嵌入块的数据源。以前是组件里裸调 invoke('read_note')：浏览器模式恒抛，
        // Tauri 模式又把"库里没这篇"吞成空串，于是两种模式各渲染出一种空白。
        // 现在桥层两侧都返回 {success, content: string|null}，null 专表示"没这篇"。
        case 'read-note': {
          const content = await invoke<string | null>('read_note', { id: args[0] });
          return { success: true, content };
        }
        // 文件树mutations：走桥层而不是组件里裸调 invoke，浏览器模式才有同一条链路可测
        case 'file-exists':
          return await invoke<boolean>('file_exists', { path: args[0] });
        case 'rename-file': {
          await invoke('rename_file', { oldPath: args[0], newPath: args[1] });
          return { success: true };
        }
        case 'move-to-trash': {
          await invoke('move_to_trash', { path: args[0] });
          return { success: true };
        }
        case 'ensure-dir': {
          await invoke('ensure_dir', { path: args[0] });
          return { success: true };
        }
        case 'write-text-file': {
          await invoke('write_text_file', { path: args[0], content: args[1] });
          return { success: true };
        }
        // 时间戳与版本历史：以前是组件里裸调 invoke，浏览器模式直接 TypeError，
        // 于是保存后既备份不出来也读不到 mtime（状态栏只能停在打开时的那一刻）。
        // 收进桥层之后两种模式共用同一条链路，UI 也才在浏览器里可验。
        case 'get-file-modified':
          return await invoke<string>('get_file_modified', { path: args[0] });
        case 'create-backup': {
          await invoke('create_backup', { notePath: args[0], content: args[1] });
          return { success: true };
        }
        case 'list-backups': {
          const backups = await invoke<any[]>('list_backups', { notePath: args[0] });
          return { success: true, backups: backups || [] };
        }
        case 'restore-backup': {
          await invoke('restore_backup', { backupPath: args[0], targetPath: args[1] });
          return { success: true };
        }
        default:
          return { success: false, error: `未知通道: ${channel}` };
      }
    } catch (e: any) {
      return { success: false, error: e?.toString() || 'Tauri 调用失败' };
    }
  },

  // 以下为 Electron IPC 事件存根，Tauri 中不需要（快捷键由 React 层处理）
  send: (_channel: string, ..._args: any[]) => {},
  on: (_channel: string, _callback: (...args: any[]) => void) => {},
  removeAllListeners: (_channel: string) => {},
};
