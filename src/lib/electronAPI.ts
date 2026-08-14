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

export const electronAPI = {
  isTauri,
  isElectron: false, // 向后兼容

  invoke: async (channel: string, ...args: any[]) => {
    if (!isTauri) {
      // 浏览器回退
      switch (channel) {
        case 'read-file':
          return { success: true, content: localStorage.getItem(`note-${args[0]}`) || '', filePath: args[0] };
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
        case 'export-html':
          return { success: true, filePath: args[1] };
        case 'export-pdf':
          return { success: true, filePath: (args[1] || 'export.pdf').replace(/\.\w+$/, '.pdf') };
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
        case 'list-files':
        case 'list-files-recursive': {
          const files = await invoke<any[]>('list_dir', { path: args[0] });
          return { success: true, files };
        }
        case 'export-html': {
          const result = await invoke<string>('export_note', { id: args[0], format: 'html', path: args[1] });
          return { success: true, filePath: result };
        }
        case 'export-pdf': {
          // 生成 HTML 并通过浏览器打印为 PDF
          const htmlResult = await invoke<string>('export_note', { id: args[0], format: 'html', path: '' });
          if (htmlResult) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
              printWindow.document.write(htmlResult);
              printWindow.document.close();
              printWindow.onload = () => {
                printWindow.print();
                printWindow.close();
              };
            }
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
