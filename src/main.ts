import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  app.commandLine.appendSwitch('--no-sandbox');
  app.commandLine.appendSwitch('--disable-gpu-sandbox');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'ZenNote',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('new-note'),
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openFile'],
              filters: [
                { name: 'Markdown Files', extensions: ['md'] },
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('open-file', result.filePaths[0]);
            }
          },
        },
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('open-folder', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('save-file'),
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('save-file-as'),
        },
        { type: 'separator' },
        {
          label: 'Export HTML',
          click: () => mainWindow?.webContents.send('export-html'),
        },
        {
          label: 'Export PDF',
          click: () => mainWindow?.webContents.send('export-pdf'),
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('find'),
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow?.webContents.send('replace'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Source Mode',
          accelerator: 'CmdOrCtrl+/',
          click: () => mainWindow?.webContents.send('toggle-source-mode'),
        },
        {
          label: 'Toggle Focus Mode',
          click: () => mainWindow?.webContents.send('toggle-focus-mode'),
        },
        {
          label: 'Toggle Typewriter Mode',
          click: () => mainWindow?.webContents.send('toggle-typewriter-mode'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('toggle-sidebar'),
        },
        {
          label: 'Toggle Outline',
          click: () => mainWindow?.webContents.send('toggle-outline'),
        },
        {
          label: 'Toggle Knowledge Graph',
          click: () => mainWindow?.webContents.send('toggle-graph'),
        },
        {
          label: 'Toggle Backlinks',
          click: () => mainWindow?.webContents.send('toggle-backlinks'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Dark Mode',
          click: () => mainWindow?.webContents.send('toggle-dark-mode'),
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      ],
    },
    {
      label: 'Insert',
      submenu: [
        {
          label: 'Table',
          click: () => mainWindow?.webContents.send('insert-table'),
        },
        {
          label: 'Image',
          click: () => mainWindow?.webContents.send('insert-image'),
        },
        {
          label: 'Link',
          click: () => mainWindow?.webContents.send('insert-link'),
        },
        {
          label: 'Code Block',
          click: () => mainWindow?.webContents.send('insert-code-block'),
        },
        {
          label: 'Math Formula',
          click: () => mainWindow?.webContents.send('insert-math-formula'),
        },
        {
          label: 'Horizontal Rule',
          click: () => mainWindow?.webContents.send('insert-horizontal-rule'),
        },
        {
          label: 'Emoji',
          click: () => mainWindow?.webContents.send('insert-emoji'),
        },
        { type: 'separator' },
        {
          label: 'Today\'s Daily Note',
          accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow?.webContents.send('create-daily-note'),
        },
        {
          label: 'From Template...',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.send('insert-template'),
        },
      ],
    },
    {
      label: 'AI',
      submenu: [
        {
          label: 'Toggle AI Assistant',
          accelerator: 'CmdOrCtrl+J',
          click: () => mainWindow?.webContents.send('toggle-ai-panel'),
        },
        {
          label: 'Summarize Note',
          click: () => mainWindow?.webContents.send('ai-summarize'),
        },
        {
          label: 'Extract Tags',
          click: () => mainWindow?.webContents.send('ai-tags'),
        },
        {
          label: 'Generate Outline',
          click: () => mainWindow?.webContents.send('ai-outline'),
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          click: () => mainWindow?.webContents.send('open-settings'),
        },
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Quick Switch',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.send('quick-switch'),
        },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow?.webContents.send('command-palette'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => mainWindow?.webContents.send('show-about'),
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => mainWindow?.webContents.send('show-keyboard-shortcuts'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------- IPC Handlers ----------

ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('show-save-dialog', async (_event, defaultPath: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath,
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'Text Files', extensions: ['txt'] },
    ],
  });
  return { canceled: result.canceled, filePath: result.filePath };
});

ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return { canceled: result.canceled, filePath: result.filePaths[0] };
});

// Enhanced list-files: recursive listing with children
ipcMain.handle('list-files', async (_event, dirPath: string) => {
  try {
    const buildEntry = (dir: string, name: string): any => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      const entry: any = {
        name,
        path: fullPath,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
      };
      if (stat.isDirectory()) {
        try {
          const children = fs
            .readdirSync(fullPath, { withFileTypes: true })
            .map((child) => buildEntry(fullPath, child.name));
          entry.children = children;
        } catch {
          entry.children = [];
        }
      }
      return entry;
    };

    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    const result = files.map((file) => buildEntry(dirPath, file.name));
    return { success: true, files: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// list-files-recursive: returns recursive file tree for .md files only
interface MdNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: MdNode[];
}

function buildMdTree(dirPath: string): MdNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes: MdNode[] = [];
  for (const entry of entries) {
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = buildMdTree(fullPath);
      // Only include directories that contain markdown files
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          children,
        });
      }
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false,
      });
    }
  }
  return nodes;
}

ipcMain.handle('list-files-recursive', async (_event, dirPath: string) => {
  try {
    const tree = buildMdTree(dirPath);
    return { success: true, tree };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// export-html: enhanced HTML export
ipcMain.handle('export-html', async (_event, content: string, filePath: string) => {
  try {
    const baseName = path.basename(filePath, path.extname(filePath));
    const htmlPath = path.join(path.dirname(filePath), `${baseName}.html`);
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${baseName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
    h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { font-size: 1.5em; margin-top: 30px; }
    h3 { font-size: 1.25em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: 'Monaco', 'Menlo', monospace; }
    pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f8f8f8; }
    ul, ol { padding-left: 24px; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; }
    hr { border: none; border-top: 1px solid #eee; margin: 30px 0; }
    .task-list-item { list-style: none; }
    .task-list-item label { cursor: pointer; }
    .task-list-item input[type="checkbox"] { margin-right: 8px; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    return { success: true, filePath: htmlPath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// export-pdf: uses BrowserWindow.printToPDF
ipcMain.handle('export-pdf', async (_event, htmlContent: string, filePath: string) => {
  try {
    const pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    await pdfWindow.loadURL(dataUrl);

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      landscape: false,
    });

    pdfWindow.close();

    const baseName = path.basename(filePath, path.extname(filePath));
    const pdfPath = path.join(path.dirname(filePath), `${baseName}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    return { success: true, filePath: pdfPath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// search-in-files: search text across all .md files in a directory
interface SearchMatch {
  filePath: string;
  line: number;
  column: number;
  text: string;
  preview: string;
}

function searchInDirectory(dirPath: string, query: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lowerQuery = query.toLowerCase();

  const walk = (currentDir: string) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, lineIndex) => {
            const col = line.toLowerCase().indexOf(lowerQuery);
            if (col !== -1) {
              const start = Math.max(0, col - 20);
              const end = Math.min(line.length, col + query.length + 20);
              matches.push({
                filePath: fullPath,
                line: lineIndex + 1,
                column: col + 1,
                text: query,
                preview: (start > 0 ? '...' : '') + line.slice(start, end) + (end < line.length ? '...' : ''),
              });
            }
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  };

  walk(dirPath);
  return matches;
}

ipcMain.handle('search-in-files', async (_event, dirPath: string, query: string) => {
  try {
    if (!query || query.trim() === '') {
      return { success: true, matches: [] };
    }
    const matches = searchInDirectory(dirPath, query);
    return { success: true, matches };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// read-file-stats: get file size, creation time, modification time
ipcMain.handle('read-file-stats', async (_event, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      success: true,
      stats: {
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// open-file-in-finder: reveal file in Finder
ipcMain.handle('open-file-in-finder', async (_event, filePath: string) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// save-image: save pasted image to a notes/images folder, return path
ipcMain.handle('save-image', async (_event, imageData: string, notesDir: string, fileName?: string) => {
  try {
    const imagesDir = path.join(notesDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Strip data URL prefix (e.g. data:image/png;base64,xxxx)
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return { success: false, error: 'Invalid image data format' };
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const finalName = fileName || `image-${Date.now()}.${ext}`;
    const finalPath = path.join(imagesDir, finalName);

    const buffer = Buffer.from(matches[2], 'base64');
    fs.writeFileSync(finalPath, buffer);

    return { success: true, filePath: finalPath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// ---------- Knowledge Graph / Backlinks / Tags ----------

interface NoteIndex {
  filePath: string;
  fileName: string;
  title: string;
  content: string;
  links: string[];   // raw [[wiki link]] targets
  tags: string[];    // #tags found in content
}

function extractLinksFromContent(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const raw = m[1];
    const note = raw.split('#')[0].trim();
    if (note) links.push(note);
  }
  return links;
}

function extractTagsFromContent(content: string): string[] {
  const tags: string[] = [];
  const re = /(^|\s)#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5-/]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    tags.push(m[2]);
  }
  return tags;
}

function deriveTitle(content: string, fileName: string): string {
  const firstHeading = content.match(/^#\s+(.+)$/m);
  if (firstHeading) return firstHeading[1].trim();
  return fileName.replace(/\.md$|\.markdown$/i, '');
}

ipcMain.handle('read-all-notes', async (_event, dirPath: string) => {
  try {
    const notes: NoteIndex[] = [];
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            notes.push({
              filePath: fullPath,
              fileName: entry.name,
              title: deriveTitle(content, entry.name),
              content,
              links: extractLinksFromContent(content),
              tags: extractTagsFromContent(content),
            });
          } catch { /* skip */ }
        }
      }
    };
    walk(dirPath);
    return { success: true, notes };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Find all notes referencing a target note title (backlinks)
ipcMain.handle('find-backlinks', async (_event, dirPath: string, targetTitle: string, targetPath: string) => {
  try {
    const backlinks: Array<{ sourcePath: string; sourceTitle: string; snippet: string; line: number }> = [];
    const targetBase = targetTitle.replace(/\.md$/i, '').toLowerCase();
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          if (fullPath === targetPath) continue;
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              const re = /\[\[([^\]]+)\]\]/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(line)) !== null) {
                const note = m[1].split('#')[0].trim().toLowerCase();
                if (note === targetBase) {
                  const start = Math.max(0, m.index - 30);
                  const end = Math.min(line.length, m.index + m[0].length + 30);
                  backlinks.push({
                    sourcePath: fullPath,
                    sourceTitle: deriveTitle(content, entry.name),
                    snippet: (start > 0 ? '...' : '') + line.slice(start, end) + (end < line.length ? '...' : ''),
                    line: idx + 1,
                  });
                }
              }
            });
          } catch { /* skip */ }
        }
      }
    };
    walk(dirPath);
    return { success: true, backlinks };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// ---------- AI: OpenAI-compatible chat completions ----------

interface AIConfigDTO {
  baseURL: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

interface ChatMessageDTO {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

ipcMain.handle('ai-chat', async (_event, config: AIConfigDTO, messages: ChatMessageDTO[]) => {
  try {
    if (!config?.enabled) {
      return { success: false, error: 'AI is disabled. Open Settings → AI Provider to configure.' };
    }
    if (!config.baseURL || !config.apiKey || !config.model) {
      return { success: false, error: 'AI config incomplete. Set baseURL, apiKey, and model.' };
    }

    const base = config.baseURL.replace(/\/$/, '');
    const url = `${base}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.4,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }

    const data: any = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return { success: true, content };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { success: false, error: 'Request timed out (60s)' };
    }
    return { success: false, error: (error as Error).message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
