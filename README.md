# ZenNote

> A beautiful, cross-platform WYSIWYG Markdown note-taking app with knowledge graph & AI, inspired by Typora, Obsidian, and Notion.

ZenNote 是一款本地优先的 Markdown 笔记工具，融合了 Typora 的所见即所得体验、Obsidian 的知识图谱与双向链接能力、思源笔记的块级引用，以及 Notion 的现代交互界面。所有笔记以纯 Markdown 文件形式保存在你的本地磁盘，无需账号、无需联网，可完全离线使用。内置 AI 助手可对接任意 OpenAI 兼容大模型，帮助整理知识、提取标签、生成大纲。

## ✨ Features

### Editor
- **WYSIWYG Editing** — Based on Tiptap v3 / ProseMirror, true what-you-see-is-what-you-get
- **Source Mode** — Press `Cmd/Ctrl + /` to toggle raw Markdown editing
- **Focus Mode** — Dim surrounding paragraphs for distraction-free writing
- **Typewriter Mode** — Keep the active line vertically centered
- **Find & Replace** — In-note search with `Cmd/Ctrl + F`
- **Auto-save** — Debounced save with dirty-state indicator
- **Multi-cursor Editing** (Sublime/VSCode-style) — `Cmd/Ctrl + D` selects the next occurrence of the current word; `Cmd/Ctrl + Shift + L` selects all matches; `Alt/Option + Click` adds a cursor; `Cmd/Ctrl + U` undoes the last selection; `Esc` collapses. Typing and backspace sync across all cursors.
- **Minimap** (Sublime-style) — Right-side scaled-down thumbnail of the whole document; click anywhere to jump, and a viewport highlight tracks the current scroll position.

### Rich Content
- **Math Formulas** — Inline `$...$` and block `$$...$$` via KaTeX
- **Code Blocks** — Syntax highlighting for 190+ languages via Lowlight / highlight.js
- **Tables** — Resizable tables with header row, full editing support
- **Task Lists** — Interactive `- [ ]` checkboxes
- **Images** — Paste from clipboard, drag & drop, or insert via URL
- **Mermaid Diagrams** — Render flowcharts, sequence diagrams, gantt charts inline
- **Emoji Picker** — Built-in emoji selection

### Knowledge Management (Obsidian / 思源风格)
- **Wiki Links** — `[[note name]]` bidirectional links
- **Block References** — `[[note#heading]]` and `[[note#^block-id]]` for granular cross-references
- **Tags** — `#tag` syntax with auto-highlighting; sidebar tag cloud aggregates all notes
- **Nested Tags** (Bear-style) — `#work/project-a` parses as a hierarchy; the tags sidebar renders a collapsible tree, and clicking a parent filters to all descendant notes (prefix match)
- **Backlinks Panel** — See every note that references the current note, with context snippets
- **Knowledge Graph** — Force-directed graph of all notes, with:
  - Tag-based color clustering (each tag gets a distinct color)
  - Node filter by name search
  - Click a tag in the legend to filter graph to that tag's notes
  - Click any node to jump to the note

### AI Assistant (大模型整理)
- **OpenAI-Compatible API** — Configure any provider: OpenAI, DeepSeek, 智谱 GLM, Kimi, Ollama, etc.
- **One-Click Actions**
  - **Summarize** — Condense the current note into 5 key points
  - **Extract Tags** — AI suggests `#tags` for the note
  - **Generate Outline** — Structured `##` outline from the note content
  - **Suggest Links** — Recommends `[[wiki links]]` to other notes in your vault
- **Chat** — Ask questions about the current note; insert any AI response into the note
- **Insert to Note** — Every AI response has an "Insert" button to drop it into the editor

### Templates & Daily Notes
- **Built-in Templates** — Daily Journal, Meeting Notes, Task List, Knowledge Card
- **Custom Templates** — Add/edit/delete your own templates in Settings → Templates
- **Placeholders** — `{{date}}`, `{{time}}`, `{{title}}` auto-filled on insert
- **Daily Note** — `Cmd/Ctrl + Shift + D` creates/opens today's note at `<vault>/Daily/YYYY-MM-DD.md`
- **Quick Insert** — `Cmd/Ctrl + Shift + I` opens the template picker

### File Management
- **Folder Tree** — Recursive sidebar tree with expand/collapse
- **Recent Files** — Quick access to the last 20 opened notes
- **Global Search** — Full-text search across all notes in an opened folder
- **Quick Switcher** — `Cmd/Ctrl + P` to fuzzy-jump between files (filtered by active tag)
- **Context Menu** — Right-click files/folders to create, rename, or delete
- **Cross-Platform Paths** — Works with any local directory you choose
- **Multi-tab Editing** (VSCode/Obsidian-style) — All open notes appear as tabs across the top; click to switch, middle-click or × to close, dirty dot shows unsaved changes
- **Split Pane** — `Cmd/Ctrl + \` toggles a horizontal split; middle-click a tab to open it in the right pane for side-by-side editing, with independent auto-save per pane

### Productivity
- **Outline Panel** — Navigate by headings, with active-section highlight
- **Command Palette** — `Cmd/Ctrl + Shift + P` for all editor commands
- **Breadcrumb Navigation** (VSCode/Obsidian-style) — Top bar shows `folder / subfolder / note title / # current heading`; click the heading segment to jump to it
- **6 Built-in Themes** — Light, Dark, Sepia, Solarized, Dracula, Nord
- **Statistics** — Live word count, character count, line count, reading time

### Export
- **HTML Export** — Styled standalone HTML
- **PDF Export** — Printable PDF documents

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + N` | New note |
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + Shift + O` | Open folder |
| `Cmd/Ctrl + S` | Save |
| `Cmd/Ctrl + Shift + S` | Save as |
| `Cmd/Ctrl + P` | Quick switcher |
| `Cmd/Ctrl + Shift + P` | Command palette |
| `Cmd/Ctrl + F` | Find & replace |
| `Cmd/Ctrl + /` | Toggle source mode |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + Shift + D` | Today's daily note |
| `Cmd/Ctrl + J` | Toggle AI assistant |
| `Cmd/Ctrl + Shift + G` | Toggle knowledge graph |
| `Cmd/Ctrl + Shift + I` | Insert from template |
| `Cmd/Ctrl + Shift + L` | Cycle theme |
| `Cmd/Ctrl + D` | Multi-cursor: select next occurrence |
| `Cmd/Ctrl + Shift + L` | Multi-cursor: select all matches |
| `Cmd/Ctrl + U` | Multi-cursor: undo last selection |
| `Alt/Option + Click` | Multi-cursor: add cursor at position |
| `Esc` | Collapse multi-cursor / close overlay |
| `Cmd/Ctrl + W` | Close active tab |
| `Cmd/Ctrl + Shift + [` | Previous tab |
| `Cmd/Ctrl + Shift + ]` | Next tab |
| `Cmd/Ctrl + \` | Toggle split pane |

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| Editor | Tiptap v3 (ProseMirror) + `@tiptap/markdown` |
| Framework | React 19 + TypeScript |
| Desktop | Electron 43 (ESM) |
| Build | Vite 6 + `tsc` |
| Packaging | electron-builder |
| Math | KaTeX + `@tiptap/extension-mathematics` |
| Code Highlight | Lowlight (highlight.js) |
| Diagrams | Mermaid |
| Graph | react-force-graph-2d |
| Icons | lucide-react |
| AI | OpenAI-compatible Chat Completions API |

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9 (or pnpm / yarn)

### Install

```bash
git clone git@github.com:z-biz/z-biz-tool-note.git
cd z-biz-tool-note
npm install
```

### Development

```bash
npm run dev
```

This starts the Vite dev server and launches Electron against it with hot reload.

### Build

```bash
npm run build
```

Type-checks and produces the production bundle in `dist/`.

### Package

```bash
# macOS (.dmg)
npm run package:mac

# Windows (.exe via NSIS)
npm run package:win

# Linux (.AppImage)
npm run package:linux
```

Artifacts are written to the `release/` directory.

## 📦 Download

Pre-built binaries are available on the [Releases page](https://github.com/z-biz/z-biz-tool-note/releases).

- macOS: `ZenNote-x.x.x.dmg`
- Windows: `ZenNote-Setup-x.x.x.exe`
- Linux: `ZenNote-x.x.x.AppImage`

## 🤖 Configuring AI

1. Open **Settings** (`Cmd/Ctrl + ,` or sidebar gear icon) → **AI Provider** tab.
2. Toggle **Enabled**.
3. Fill in **Base URL**, **API Key**, and **Model**, or click a preset:
   - OpenAI — `https://api.openai.com/v1` · `gpt-4o-mini`
   - DeepSeek — `https://api.deepseek.com/v1` · `deepseek-chat`
   - 智谱 GLM — `https://open.bigmodel.cn/api/paas/v4` · `glm-4-flash`
   - Kimi — `https://api.moonshot.cn/v1` · `moonshot-v1-8k`
   - Ollama (local) — `http://localhost:11434/v1` · `llama3.1`
4. Click **Save**. Open the AI panel with `Cmd/Ctrl + J`.

> Your API key is stored only in `localStorage` on your own machine and is sent directly to the provider you configure. ZenNote never proxies or logs your requests.

## 📁 Project Structure

```
z-biz-tool-note/
├── src/
│   ├── components/        # React UI components
│   │   ├── Editor.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Outline.tsx
│   │   ├── KnowledgeGraph.tsx
│   │   ├── BacklinksPanel.tsx
│   │   ├── AIPanel.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── QuickInsert.tsx
│   │   ├── TagsPanel.tsx
│   │   ├── QuickSwitcher.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── FolderContextMenu.tsx
│   │   └── StatusBar.tsx
│   ├── hooks/             # React hooks (file operations, etc.)
│   ├── lib/               # Tiptap extensions, themes, AI, templates
│   │   ├── MermaidExtension.ts
│   │   ├── WikiLinkExtension.ts
│   │   ├── TagExtension.ts
│   │   ├── BlockReferenceExtension.ts
│   │   ├── templates.ts
│   │   ├── themes.ts
│   │   └── electronAPI.ts
│   ├── types/             # Shared TypeScript types
│   ├── App.tsx
│   ├── main.ts            # Electron main process (file ops + AI IPC)
│   ├── index.css          # Global styles & theme variables
│   └── preload.ts         # Electron preload bridge
├── package.json
├── electron-builder.yml   # (config in package.json)
├── vite.config.ts
└── tsconfig.json
```

## 🎨 Theming

ZenNote ships with 6 themes. The theme is applied via CSS variables on `:root`, so custom themes can be added by extending `src/lib/themes.ts`:

```ts
export const THEMES = [
  { name: 'light',     label: 'Light' },
  { name: 'dark',      label: 'Dark' },
  { name: 'sepia',     label: 'Sepia' },
  { name: 'solarized', label: 'Solarized' },
  { name: 'dracula',   label: 'Dracula' },
  { name: 'nord',      label: 'Nord' },
];
```

## 📝 Markdown Syntax

ZenNote follows CommonMark with GitHub-flavored extensions:

- Headings, bold, italic, strikethrough, inline code
- Blockquotes, ordered/unordered lists, task lists
- Tables, horizontal rules
- Fenced code blocks with language hints
- Inline and block math (`$...$`, `$$...$$`)
- Mermaid diagrams via fenced ` ```mermaid ` blocks
- Wiki links `[[Note Title]]` for bidirectional linking
- Block references `[[Note Title#heading]]` and `[[Note Title#^block-id]]`
- Tags `#tag` (auto-highlighted, aggregated in sidebar)
- Images via `![alt](url)` or paste/drag

## 🔒 Privacy

ZenNote is **local-first**. Notes are stored as plain `.md` files on your own disk. No telemetry, no account, no cloud sync. The AI feature is opt-in and calls only the provider you explicitly configure — your API key never leaves your machine except to that provider. You own your data.

## 🗺 Roadmap

- [ ] Cloud sync (optional, end-to-end encrypted)
- [ ] Plugin system
- [ ] Mobile companion app
- [ ] Real-time collaboration
- [ ] Full-text search index (SQLite FTS5)
- [ ] Embedded Excalidraw whiteboard
- [ ] PDF annotation

## 📄 License

MIT © ZenNote

## 🙏 Acknowledgements

Built on the shoulders of giants:

- [Tiptap](https://tiptap.dev) — Headless editor framework
- [Electron](https://www.electronjs.org) — Cross-platform desktop runtime
- [React](https://react.dev) — UI library
- [Vite](https://vitejs.dev) — Next-gen build tooling
- [Mermaid](https://mermaid.js.org) — Diagramming
- [KaTeX](https://katex.org) — Math typesetting
- [react-force-graph](https://github.com/vasturiano/react-force-graph) — Knowledge graph

Inspired by the UX of [Typora](https://typora.io), [Obsidian](https://obsidian.md), [思源笔记](https://b3log.org/siyuan/), and [Notion](https://notion.so).
