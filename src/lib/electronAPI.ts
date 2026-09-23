// Tauri API 桥接层
// 在 Tauri 环境中使用 invoke 调用 Rust 命令，浏览器中使用 localStorage 回退

import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { sanitizeExport } from './sanitize';
import { promptDialog } from './dialogs';

// 检测是否运行在 Tauri 环境
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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
};

function demoFs(): DemoFs {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_FS_KEY) || 'null');
    if (saved && Array.isArray(saved.files) && Array.isArray(saved.dirs)) return saved as DemoFs;
  } catch {}
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

/** 与 Rust read_all_notes 同构的摘要，让标签 / 图谱 / 反链在浏览器里也能验证 */
function demoNoteSummaries() {
  return demoFs().files.map(filePath => {
    const content = demoContentOf(filePath);
    return {
      filePath,
      content,
      title: content.match(/^#\s+(.+)$/m)?.[1] ?? filePath.split('/').pop()?.replace(/\.md$/, '') ?? filePath,
      tags: (content.match(/^tags:\s*\[(.*?)\]/m)?.[1] ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      links: [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim()),
    };
  });
}

/** 演示工作区的暴力搜索，产出与 Rust 一致的结构（preview 里用 <mark> 包命中词） */
function demoSearch(query: unknown) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const out: { filePath: string; line: number; preview: string }[] = [];
  for (const filePath of demoFs().files) {
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
  const htmlContent = content.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
    if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
    if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return `<li>${escapeHtml(trimmed.slice(2))}</li>`;
    if (trimmed.startsWith('> ')) return `<blockquote><p>${escapeHtml(trimmed.slice(2))}</p></blockquote>`;
    if (trimmed === '---') return '<hr/>';
    if (trimmed === '') return '';
    return `<p>${escapeHtml(trimmed)}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>ZenNote Export</title>
<style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#333}
h1,h2,h3{margin-top:1.5em}blockquote{border-left:3px solid #ddd;padding-left:1em;color:#666}
code{background:#f5f5f5;padding:2px 4px;border-radius:3px}hr{border:none;border-top:1px solid #ddd;margin:2em 0}
li{margin:0.3em 0}</style></head>
<body>${htmlContent}</body></html>`;
}

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
            return { success: false, error: '文件不存在（浏览器演示区）', filePath: path };
          }
          return { success: true, content: demoContentOf(path), filePath: path };
        }
        case 'read-file-binary':
          return { success: false, error: '浏览器模式不可用' };
        case 'get-file-meta':
          return { success: true, size: 0, modified: new Date().toISOString(), mime: 'application/octet-stream', filePath: args[0] };
        case 'write-file': {
          const path = String(args[0]);
          localStorage.setItem(`note-${path}`, args[1]);
          // 另存为/新建走的就是这条路径，路径表里没有的话树上看不到
          const fs = demoFs();
          if (!fs.files.includes(path)) {
            fs.files.push(path);
            saveDemoFs(fs);
          }
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
        case 'write-text-file': {
          const fs = demoFs();
          const path = String(args[0]);
          if (!fs.files.includes(path)) fs.files.push(path);
          saveDemoFs(fs);
          localStorage.setItem(`note-${path}`, args[1]);
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
          const content = args[0] as string;
          const fullHtml = generateHtmlFromContent(content);
          return { success: true, html: fullHtml, filePath: args[1] };
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
          return { success: false, error: '浏览器模式不可用' };
        case 'read-all-notes':
          return { success: true, notes: demoNoteSummaries() };
        case 'find-backlinks':
          return { success: true, backlinks: [] };
        case 'ai-chat':
          return { success: false, error: '浏览器模式不可用' };
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
          } catch {}
          if (size > 5 * 1024 * 1024) {
            // 大文件：返回 asset URL，前端用 <video>/<img>/<embed> 直接加载
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
          const content = args[0] as string;
          const filePath = args[1] as string;
          const safeContent = sanitizeExport(content);
          const fullHtml = generateHtmlFromContent(safeContent);
          if (filePath) {
            await invoke('write_file', { path: filePath, content: fullHtml });
            return { success: true, filePath };
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
        case 'read-file-stats':
          return { success: true, stats: { size: 0, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), isFile: true, isDirectory: false } };
        case 'open-file-in-finder':
          return { success: false, error: 'Tauri 模式暂不支持' };
        case 'save-image': {
          const relativePath = await invoke<string>('save_image', { noteId: args[0], data: args[1] });
          return { success: true, path: relativePath };
        }
        case 'ai-chat': {
          try {
            const content = await invoke<string>('ai_chat', { config: args[0], messages: args[1] });
            return { success: true, content };
          } catch (e: any) {
            return { success: false, error: e?.toString() || 'AI 请求失败' };
          }
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
