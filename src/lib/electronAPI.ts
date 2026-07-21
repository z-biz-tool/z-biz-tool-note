// Electron API compatibility layer
// When running in Electron, uses ipcRenderer; when in browser, uses localStorage fallback

const isElectron = typeof window !== 'undefined' &&
  !!(window as any).process?.versions?.electron;

let ipcRenderer: any = null;
if (isElectron) {
  try {
    ipcRenderer = require('electron').ipcRenderer;
  } catch {
    // fallback
  }
}

export const electronAPI = {
  isElectron,

  invoke: async (channel: string, ...args: any[]) => {
    if (ipcRenderer) {
      return ipcRenderer.invoke(channel, ...args);
    }
    // Browser fallback
    switch (channel) {
      case 'read-file': {
        const content = localStorage.getItem(`note-${args[0]}`) || '';
        return { success: true, content, filePath: args[0] };
      }
      case 'write-file': {
        localStorage.setItem(`note-${args[0]}`, args[1]);
        return { success: true };
      }
      case 'show-save-dialog': {
        const name = prompt('Save as (filename):', args[0]?.split('/').pop() || 'untitled.md');
        if (!name) return { canceled: true };
        return { canceled: false, filePath: name };
      }
      case 'show-open-dialog': {
        return { canceled: true };
      }
      case 'list-files': {
        // Return demo files in browser mode
        return {
          success: true,
          files: [
            {
              name: 'Welcome.md',
              isDirectory: false,
              isFile: true,
              path: 'demo/Welcome.md',
            },
            {
              name: 'Getting Started.md',
              isDirectory: false,
              isFile: true,
              path: 'demo/Getting Started.md',
            },
            {
              name: 'Examples',
              isDirectory: true,
              isFile: false,
              path: 'demo/Examples',
              children: [
                {
                  name: 'Code.md',
                  isDirectory: false,
                  isFile: true,
                  path: 'demo/Examples/Code.md',
                },
                {
                  name: 'Tables.md',
                  isDirectory: false,
                  isFile: true,
                  path: 'demo/Examples/Tables.md',
                },
              ],
            },
          ],
        };
      }
      case 'list-files-recursive': {
        return {
          success: true,
          tree: [
            {
              name: 'Welcome.md',
              path: 'demo/Welcome.md',
              isDirectory: false,
            },
            {
              name: 'Getting Started.md',
              path: 'demo/Getting Started.md',
              isDirectory: false,
            },
            {
              name: 'Examples',
              path: 'demo/Examples',
              isDirectory: true,
              children: [
                {
                  name: 'Code.md',
                  path: 'demo/Examples/Code.md',
                  isDirectory: false,
                },
                {
                  name: 'Tables.md',
                  path: 'demo/Examples/Tables.md',
                  isDirectory: false,
                },
              ],
            },
          ],
        };
      }
      case 'export-html': {
        return { success: true, filePath: args[1] };
      }
      case 'export-pdf': {
        return { success: true, filePath: (args[1] || 'export.pdf').replace(/\.\w+$/, '.pdf') };
      }
      case 'search-in-files': {
        return { success: true, matches: [] };
      }
      case 'read-file-stats': {
        return {
          success: true,
          stats: {
            size: 0,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            isFile: true,
            isDirectory: false,
          },
        };
      }
      case 'open-file-in-finder': {
        return { success: false, error: 'Not available in browser mode' };
      }
      case 'save-image': {
        return { success: false, error: 'Not available in browser mode' };
      }
      default:
        return { success: false, error: 'Not available in browser mode' };
    }
  },

  send: (channel: string, ...args: any[]) => {
    if (ipcRenderer) {
      ipcRenderer.send(channel, ...args);
    }
    // Browser mode: no-op (events handled internally by the renderer)
  },

  on: (channel: string, callback: (...args: any[]) => void) => {
    if (ipcRenderer) {
      // Electron's ipcRenderer.on passes (event, ...args); wrap to expose args only
      ipcRenderer.on(channel, (_event: unknown, ...args: any[]) => {
        callback(...args);
      });
    }
    // Browser mode: no-op (renderer can dispatch its own events)
  },

  removeAllListeners: (channel: string) => {
    if (ipcRenderer) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
};
