// Tauri API 桥接层
// 在 Tauri 环境中使用 invoke 调用 Rust 命令，浏览器中使用 localStorage 回退

import { invoke } from '@tauri-apps/api/core';

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

// 浏览器模式下的演示文件
const demoFiles = [
  { name: 'Welcome.md', isDirectory: false, isFile: true, path: 'demo/Welcome.md' },
  { name: 'Getting Started.md', isDirectory: false, isFile: true, path: 'demo/Getting Started.md' },
  {
    name: 'Examples', isDirectory: true, isFile: false, path: 'demo/Examples',
    children: [
      { name: 'Code.md', isDirectory: false, isFile: true, path: 'demo/Examples/Code.md' },
      { name: 'Tables.md', isDirectory: false, isFile: true, path: 'demo/Examples/Tables.md' },
    ],
  },
];

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

  invoke: async (channel: string, ...args: any[]) => {
    if (!isTauri) {
      // 浏览器回退
      switch (channel) {
        case 'read-file':
          return { success: true, content: localStorage.getItem(`note-${args[0]}`) || '', filePath: args[0] };
        case 'read-file-binary':
          return { success: false, error: '浏览器模式不可用' };
        case 'get-file-meta':
          return { success: true, size: 0, modified: new Date().toISOString(), mime: 'application/octet-stream', filePath: args[0] };
        case 'write-file':
          localStorage.setItem(`note-${args[0]}`, args[1]);
          return { success: true };
        case 'show-save-dialog': {
          const name = prompt('Save as (filename):', args[0]?.split('/').pop() || 'untitled.md');
          return name ? { canceled: false, filePath: name } : { canceled: true };
        }
        case 'show-open-dialog':
          return { canceled: true };
        case 'list-files':
        case 'list-files-recursive':
          return { success: true, files: demoFiles };
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
          return { success: true, matches: [] };
        case 'read-file-stats':
          return { success: true, stats: { size: 0, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), isFile: true, isDirectory: false } };
        case 'open-file-in-finder':
          return { success: false, error: '浏览器模式不可用' };
        case 'save-image':
          return { success: false, error: '浏览器模式不可用' };
        case 'read-all-notes':
          return { success: true, notes: [] };
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
          const base64 = await invoke<string>('read_file_binary', { path: args[0] });
          return { success: true, base64, filePath: args[0] };
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
          const name = prompt('Save as (filename):', args[0]?.split('/').pop() || 'untitled.md');
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
          // 直接将内容导出为 HTML 文件
          const content = args[0] as string;
          const filePath = args[1] as string;
          const fullHtml = generateHtmlFromContent(content);
          if (filePath) {
            await invoke('write_file', { path: filePath, content: fullHtml });
            return { success: true, filePath };
          }
          return { success: true, html: fullHtml };
        }
        case 'export-pdf': {
          // PDF 导出通过浏览器打印
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
