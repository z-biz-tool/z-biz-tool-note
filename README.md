# ZenNote

> 本地优先的跨平台 WYSIWYG Markdown 笔记应用，融合知识图谱与 AI 助手

![tech](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri)
![tech](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![tech](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![tech](https://img.shields.io/badge/Tiptap-v3-9B59B6?logo=tiptap)
![tech](https://img.shields.io/badge/Mermaid-blue?logo=mermaid)
![tech](https://img.shields.io/badge/KaTeX-blue?logo=katex)
![tech](https://img.shields.io/badge/Rust-stable-DEA584?logo=rust)

ZenNote 是一款本地优先的 Markdown 笔记工具，融合了 Typora 的所见即所得体验、Obsidian 的知识图谱与双向链接能力、思源笔记的块级引用、Sublime/VSCode 的多光标与 Minimap、Bear 的嵌套标签，以及 Notion 的现代交互界面。所有笔记以纯 Markdown 文件形式保存在你的本地磁盘，无需账号、无需联网，可完全离线使用。内置 AI 助手可对接任意 OpenAI 兼容大模型，帮助整理知识、提取标签、生成大纲。

---

## 功能总览

| 类别 | 功能 |
|---|---|
| 编辑器 | WYSIWYG / 源码 / 专注 / 打字机 4 种模式，多光标，查找替换 |
| 富文本 | 数学公式、代码高亮、表格、任务列表、Mermaid 图表、图片 |
| 知识管理 | WikiLink 双向链接、块引用、标签（含嵌套）、反向链接面板、知识图谱 |
| AI 助手 | OpenAI 兼容 API，一键摘要/标签/大纲/链接推荐，多轮对话 |
| 文件管理 | 文件夹树、多标签、分屏编辑、快速切换、全局搜索 |
| 效率工具 | 命令面板、面包屑导航、大纲面板、Minimap、模板与每日笔记 |
| 导出 | HTML、PDF（打印导出） |
| 主题 | 6 套内置主题 + 自定义字体/字号 |
| 安全 | 路径验证、XSS 防护、CSP 策略、废纸篓删除、版本历史 |
| 性能 | 代码分割（主 chunk < 700KB）、React.lazy 按需加载、防抖更新 |

---

## 编辑器

### 4 种编辑模式
- **所见即所得 (WYSIWYG)** — 基于 Tiptap v3 / ProseMirror，真正的即写即见
- **源码模式** — `Cmd/Ctrl + /` 切换原始 Markdown 编辑，支持自动换行切换
- **专注模式** — 淡化非当前段落，沉浸式写作
- **打字机模式** — 当前行始终垂直居中

### 多光标编辑 (Sublime/VSCode 风格)
- `Cmd/Ctrl + D` — 选中当前词，再按选中下一个相同词
- `Cmd/Ctrl + Shift + L` — 选中所有匹配项
- `Alt/Option + Click` — 在点击位置添加光标
- `Cmd/Ctrl + U` — 撤销上一次光标/选区操作
- `Esc` — 折叠为单光标
- 输入、退格、替换操作在所有光标间同步

### Minimap (Sublime 风格)
- 右侧缩略图显示全文概览
- 点击任意位置跳转
- 视口高亮矩形跟踪当前滚动位置
- 支持拖拽视口条快速滚动

### 查找与替换
- `Cmd/Ctrl + F` 打开搜索栏
- 支持大小写敏感切换
- 上一个/下一个匹配跳转
- 单个替换 / 全部替换
- 每个编辑器实例独立搜索状态（分屏互不干扰）
- 零长度正则匹配安全防护

### 自动保存
- 内容变更后 1.5 秒自动保存
- 标签页显示脏状态指示点
- `Cmd/Ctrl + S` 手动保存，保存成功后 toast 提示
- 关闭未保存标签时弹出确认对话框
- 关闭窗口时 `beforeunload` 事件保护

---

## 富文本内容

### 数学公式
- 行内公式 `$E=mc^2$` 和块级公式 `$$...$$`
- 基于 KaTeX 渲染，支持宏与化学方程式

### 代码块
- 190+ 语言语法高亮（Lowlight / highlight.js）
- 预加载 12 种常用语言，其余按需加载
- 代码块折叠

### 表格
- 可调整列宽的表格编辑
- 表头行支持
- 添加/删除行列

### 任务列表
- 交互式 `- [ ]` / `- [x]` 复选框
- 点击切换完成状态

### Mermaid 图表
- 流程图、时序图、甘特图、饼图等
- 代码块内实时渲染
- 渲染错误时显示错误提示

### 图片
- 剪贴板粘贴自动保存到磁盘（相对路径引用）
- 拖拽图片自动保存到磁盘（与粘贴行为一致）
- 点击图片打开 Lightbox 全屏预览
- 图片缩放调整

### 其他
- Emoji 选择器
- 分割线 `---`
- 引用块 `>`
- 删除线、高亮标记

---

## 知识管理

### WikiLink 双向链接
- `[[笔记名]]` 语法自动高亮
- 点击 WikiLink 跳转到目标笔记（自动解析标题→文件路径）
- 反向链接面板显示所有引用当前笔记的笔记

### 块引用
- `[[笔记名#标题]]` 引用特定章节
- `[[笔记名#^block-id]]` 引用特定块

### 标签系统
- `#tag` 语法自动高亮
- 侧边栏标签云聚合所有笔记的标签
- 点击标签筛选相关笔记

### 嵌套标签 (Bear 风格)
- `#work/project-a` 解析为层级结构：work > project-a
- 标签侧边栏渲染为可折叠树
- 点击父标签筛选所有后代笔记（前缀匹配）
- 显示每个标签的笔记数量（含后代去重）

### 反向链接面板
- 显示所有引用当前笔记的其他笔记
- 附带上下文片段预览
- 点击跳转到引用笔记

### 知识图谱
- 力导向图展示所有笔记的链接关系
- 标签颜色聚类（每个标签分配独立颜色）
- 节点名称搜索过滤
- 图例中点击标签筛选该标签的笔记
- 点击节点跳转到对应笔记
- 按需加载（React.lazy），不影响首屏性能

---

## AI 助手

### OpenAI 兼容 API
- 支持任意 OpenAI 兼容提供商：OpenAI、DeepSeek、智谱 GLM、Kimi、Ollama 等
- API 密钥仅存储在本地 `localStorage`，直连提供商，ZenNote 不代理或记录请求

### 一键操作
- **摘要** — 将当前笔记浓缩为 5 个要点
- **提取标签** — AI 推荐 `#tags`
- **生成大纲** — 从内容生成结构化 `##` 大纲
- **推荐链接** — 推荐 `[[wiki links]]` 到库中其他笔记

### 多轮对话
- 针对当前笔记的上下文对话
- 自动携带最近 10 条对话历史
- 任何 AI 回复可一键插入编辑器

### 预设提供商
| 提供商 | Base URL | 模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Ollama (本地) | `http://localhost:11434/v1` | `llama3.1` |

---

## 文件管理

### 文件夹树
- 递归侧边栏树，展开/折叠
- 右键菜单：新建文件/文件夹、重命名、移到废纸篓
- 重命名时弹出输入框让用户指定新名称
- 删除操作移到系统废纸篓（非永久删除）
- 新建/删除后自动刷新文件树

### 多标签编辑 (VSCode/Obsidian 风格)
- 顶部标签栏显示所有打开的笔记
- 点击切换，中键在分屏中打开，× 关闭
- 脏状态指示点（未保存标记）
- 标签拖拽排序
- 右键菜单：关闭标签 / 关闭其他 / 关闭右侧 / 复制文件路径
- `Cmd/Ctrl + W` 关闭当前标签
- `Cmd/Ctrl + Shift + [` / `]` 切换上/下一个标签
- 关闭未保存标签时弹出确认

### 分屏编辑
- `Cmd/Ctrl + \` 切换水平分屏
- 中键点击标签在右侧窗格打开
- 两个窗格独立自动保存、独立状态栏、独立面包屑
- 分屏滚动同步（按比例同步滚动位置）
- 分屏文件变更独立监听

### 快速切换
- `Cmd/Ctrl + P` 模糊搜索跳转文件
- 按当前活跃标签过滤

### 全局搜索
- 侧边栏搜索标签页，全文搜索所有笔记
- 大小写不敏感
- 搜索结果点击跳转

### 最近文件
- 快速访问最近 20 个打开的笔记

---

## 效率工具

### 命令面板
- `Cmd/Ctrl + Shift + P` 执行所有编辑器命令
- 分类显示：文件、编辑、视图、工具

### 面包屑导航 (VSCode/Obsidian 风格)
- 顶部显示 `文件夹 / 子文件夹 / 笔记标题 / # 当前标题`
- 点击标题段跳转到对应标题位置
- 自动跟踪光标最近的 H1/H2/H3

### 大纲面板
- 按标题层级导航
- 当前章节高亮
- 点击跳转

### Minimap
- 右侧 72px 缩略图列
- 点击跳转，视口高亮跟踪
- 支持拖拽视口条

### 模板与每日笔记
- **内置模板** — 日记、会议记录、任务列表、知识卡片
- **自定义模板** — 设置中添加/编辑/删除
- **占位符** — `{{date}}`、`{{time}}`、`{{title}}` 自动填充
- **每日笔记** — `Cmd/Ctrl + Shift + D` 创建/打开当天笔记
- **快速插入** — `Cmd/Ctrl + Shift + I` 打开模板选择器

### 统计信息
- 实时字数统计（中日韩字符逐字计数 + 非CJK按空格分词）
- 字符数、行数、段落数
- 阅读时间估算（200字/分钟）
- 状态栏显示 "已保存 HH:MM" 时间戳

---

## 主题与外观

### 6 套内置主题
| 主题 | 风格 |
|---|---|
| Light | 明亮简洁 |
| Dark | 深色护眼 |
| Sepia | 暖色阅读 |
| Solarized | 经典 Solarized |
| Dracula | 流行暗色 |
| Nord | 北欧冷色 |

### 外观设置
- 字体大小滑块（12px - 24px）
- 字体选择下拉（系统字体 + 等宽字体）
- 实时预览生效
- `Cmd/Ctrl + Shift + L` 循环切换主题

---

## 安全与可靠性

### 数据安全
- **路径验证** — 所有文件操作验证路径在用户主目录或 /tmp 范围内，防止路径遍历攻击
- **XSS 防护** — HTML 导出转义特殊字符，Mermaid 渲染安全处理
- **CSP 策略** — 启用内容安全策略限制脚本执行
- **废纸篓删除** — 删除操作移到系统废纸篓，非永久删除
- **Rust CJK 安全** — 文件名截断使用字符级操作，避免中文 UTF-8 截断 panic

### 数据保护
- **关闭窗口保护** — `beforeunload` 事件，有未保存更改时弹出浏览器警告
- **关闭标签确认** — 关闭未保存标签时弹出确认对话框
- **关闭多标签确认** — "关闭其他"/"关闭右侧"时检查脏标签
- **版本历史** — 保存时自动备份，最多保留 20 个版本
  - `Cmd/Ctrl + Shift + H` 打开版本历史面板
  - 可预览历史版本内容
  - 一键恢复到任意历史版本

### 文件监听
- 每 5 秒检测外部文件修改
- 检测到变更时弹出确认对话框，可选择重新加载
- 主窗格和分屏窗格独立监听

### 错误处理
- React ErrorBoundary 包裹整个应用，渲染错误时显示重试界面
- 组件级错误不会导致白屏

---

## 导出

- **HTML 导出** — 生成带样式的独立 HTML 文件，前端直接生成（不依赖后端）
- **PDF 导出** — 通过浏览器打印功能生成 PDF

---

## 性能优化

### 代码分割
| Chunk | 大小 | 说明 |
|---|---|---|
| index | ~617KB | 核心应用代码 |
| vendor-tiptap | ~416KB | Tiptap 编辑器框架 |
| vendor-mermaid | ~698KB | Mermaid 图表（按需加载） |
| vendor-katex | ~260KB | KaTeX 数学公式 |
| vendor-graph | ~157KB | 知识图谱（按需加载） |

### 按需加载
- KnowledgeGraph、VersionHistory、SettingsDialog、AIPanel 使用 `React.lazy` 延迟加载
- 首屏不加载未使用的功能模块

### 渲染优化
- 6 个展示组件包裹 `React.memo`（StatusBar、Breadcrumb、BacklinksPanel、TagsPanel、Minimap、TabsBar）
- 统计信息/标题列表/大纲 300ms 防抖更新
- Minimap 滚动 rAF 节流 + 文本重建 200ms 防抖
- 知识图谱 ForceGraph2D 回调 memo 化

---

## 无障碍

- 标签栏：`role="tablist"` / `role="tab"` + 方向键导航
- 侧边栏：`role="navigation"` / `role="tree"` / `role="treeitem"`
- 状态栏：`role="status"` + `aria-live="polite"`
- 弹窗：`role="dialog"` + `aria-modal="true"`（快速切换、命令面板、设置、版本历史）
- 上下文菜单：`role="menu"` / `role="menuitem"` + 键盘 Enter 激活
- Toast：`role="alert"` + `aria-live="assertive"`

---

## 键盘快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl + N` | 新建笔记 |
| `Cmd/Ctrl + O` | 打开文件 |
| `Cmd/Ctrl + Shift + O` | 打开文件夹 |
| `Cmd/Ctrl + S` | 保存 |
| `Cmd/Ctrl + Shift + S` | 另存为 |
| `Cmd/Ctrl + P` | 快速切换 |
| `Cmd/Ctrl + Shift + P` | 命令面板 |
| `Cmd/Ctrl + F` | 查找与替换 |
| `Cmd/Ctrl + /` | 切换源码模式 |
| `Cmd/Ctrl + B` | 切换侧边栏 |
| `Cmd/Ctrl + Shift + D` | 每日笔记 |
| `Cmd/Ctrl + J` | 切换 AI 助手 |
| `Cmd/Ctrl + Shift + G` | 切换知识图谱 |
| `Cmd/Ctrl + Shift + I` | 插入模板 |
| `Cmd/Ctrl + Shift + L` | 循环切换主题 |
| `Cmd/Ctrl + Shift + H` | 版本历史 |
| `Cmd/Ctrl + D` | 多光标：选中下一个相同词 |
| `Cmd/Ctrl + Shift + L` | 多光标：选中所有匹配 |
| `Cmd/Ctrl + U` | 多光标：撤销上一次选区 |
| `Alt/Option + Click` | 多光标：添加光标 |
| `Esc` | 折叠多光标 / 关闭弹窗 |
| `Cmd/Ctrl + W` | 关闭当前标签 |
| `Cmd/Ctrl + Shift + [` | 上一个标签 |
| `Cmd/Ctrl + Shift + ]` | 下一个标签 |
| `Cmd/Ctrl + \` | 切换分屏 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 编辑器 | Tiptap v3 (ProseMirror) + `@tiptap/markdown` |
| 框架 | React 19 + TypeScript |
| 桌面端 | Tauri v2 (Rust 后端) |
| 构建 | Vite 6 + `tsc` |
| 数学 | KaTeX + `@tiptap/extension-mathematics` |
| 代码高亮 | Lowlight (highlight.js) |
| 图表 | Mermaid |
| 知识图谱 | react-force-graph-2d |
| 图标 | lucide-react |
| AI | OpenAI 兼容 Chat Completions API |

---

## 快速开始

### 前置要求

- Node.js >= 18
- npm >= 9
- Rust (Tauri 构建)
- macOS / Windows / Linux

### 安装

```bash
git clone git@github.com:z-biz/z-biz-tool-note.git
cd z-biz-tool-note
npm install
```

### 开发

```bash
npm run dev
```

启动 Vite 开发服务器并启动 Tauri 窗口，支持热重载。

### 构建

```bash
npm run build
```

类型检查并生成生产包到 `dist/`。

### 打包

```bash
# macOS (.dmg)
npm run tauri build

# Windows (.exe) — 需在 Windows 上运行
npm run tauri build

# Linux (.AppImage) — 需在 Linux 上运行
npm run tauri build
```

产物输出到 `src-tauri/target/release/bundle/`。

---

## 下载

预构建二进制文件可在 [Releases 页面](https://github.com/z-biz/z-biz-tool-note/releases) 下载。

- macOS: `ZenNote-x.x.x-arm64.dmg` / `ZenNote-x.x.x-x64.dmg`
- Windows: `ZenNote-Setup-x.x.x.exe`
- Linux: `ZenNote-x.x.x.AppImage`

> macOS 的 .dmg 未签名，首次打开需在「系统设置 → 隐私与安全性」中点击「仍要打开」。

---

## 配置 AI

1. 打开 **设置** (`Cmd/Ctrl + ,` 或侧边栏齿轮图标) → **AI Provider** 标签
2. 开启 **Enabled**
3. 填写 **Base URL**、**API Key** 和 **Model**，或点击预设
4. 点击 **Save**，用 `Cmd/Ctrl + J` 打开 AI 面板

> 你的 API 密钥仅存储在本机 `localStorage`，直连你配置的提供商。ZenNote 不代理或记录你的请求。

---

## 项目结构

```
z-biz-tool-note/
├── src/
│   ├── components/          # React UI 组件
│   │   ├── Editor.tsx       # Tiptap 编辑器（4 种模式 + 多光标 + Minimap）
│   │   ├── Sidebar.tsx      # 侧边栏（文件树/搜索/标签/最近）
│   │   ├── TabsBar.tsx      # 标签栏（拖拽排序 + 右键菜单）
│   │   ├── Breadcrumb.tsx   # 面包屑导航
│   │   ├── Minimap.tsx      # 缩略图
│   │   ├── StatusBar.tsx    # 状态栏（字数/保存时间）
│   │   ├── Outline.tsx      # 大纲面板
│   │   ├── KnowledgeGraph.tsx # 知识图谱
│   │   ├── BacklinksPanel.tsx # 反向链接面板
│   │   ├── AIPanel.tsx      # AI 助手面板
│   │   ├── TagsPanel.tsx    # 嵌套标签树
│   │   ├── VersionHistory.tsx # 版本历史
│   │   ├── SettingsDialog.tsx # 设置对话框
│   │   ├── QuickSwitcher.tsx  # 快速切换
│   │   ├── CommandPalette.tsx # 命令面板
│   │   ├── QuickInsert.tsx    # 模板插入
│   │   ├── FindReplace.tsx    # 查找替换
│   │   ├── ErrorBoundary.tsx  # 错误边界
│   │   └── FolderContextMenu.tsx # 右键菜单
│   ├── hooks/               # React hooks
│   ├── lib/                 # Tiptap 扩展、主题、AI、模板
│   │   ├── MermaidExtension.ts
│   │   ├── WikiLinkExtension.ts
│   │   ├── TagExtension.ts
│   │   ├── BlockReferenceExtension.ts
│   │   ├── MultiCursorExtension.ts
│   │   ├── SearchEnhancedExtension.ts
│   │   ├── FoldExtension.ts
│   │   ├── ImageEnhancedExtension.ts
│   │   ├── CalloutExtension.ts
│   │   ├── DragHandleExtension.ts
│   │   ├── templates.ts
│   │   ├── themes.ts
│   │   └── electronAPI.ts
│   ├── types/               # TypeScript 类型定义
│   ├── App.tsx              # 主应用（状态管理 + 布局）
│   ├── index.css            # 全局样式与主题变量
│   └── main.tsx             # 入口
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri 主进程
│   │   ├── lib.rs           # 命令注册
│   │   └── commands.rs      # Rust 命令（文件操作 + AI + 搜索 + 备份）
│   └── tauri.conf.json      # Tauri 配置
├── .github/workflows/
│   └── build-release.yml    # CI/CD 多平台构建
├── package.json
├── vite.config.ts           # Vite 配置（含代码分割）
└── tsconfig.json
```

---

## 主题

ZenNote 内置 6 套主题，通过 CSS 变量应用于 `:root`。自定义主题可扩展 `src/lib/themes.ts`：

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

---

## Markdown 语法

ZenNote 遵循 CommonMark 并扩展 GitHub Flavored Markdown：

- 标题、粗体、斜体、删除线、行内代码
- 引用块、有序/无序列表、任务列表
- 表格、分割线
- 带语言提示的围栏代码块
- 行内和块级数学公式（`$...$`、`$$...$$`）
- Mermaid 图表（` ```mermaid ` 代码块）
- WikiLink 双向链接 `[[笔记名]]`
- 块引用 `[[笔记名#标题]]` 和 `[[笔记名#^block-id]]`
- 标签 `#tag` / 嵌套标签 `#work/project-a`
- 图片 `![alt](url)` 或粘贴/拖拽插入

---

## 隐私

ZenNote 是**本地优先**的。笔记以纯 `.md` 文件保存在你自己的磁盘上。无遥测、无账号、无云同步。AI 功能为可选，仅调用你明确配置的提供商——你的 API 密钥除了发送给该提供商外不会离开你的设备。你拥有你的数据。

---

## 路线图

- [ ] 云同步（可选，端到端加密）
- [ ] 插件系统
- [ ] 移动端伴侣应用
- [ ] 实时协作
- [ ] 全文搜索索引（SQLite FTS5）
- [ ] 嵌入 Excalidraw 白板
- [ ] PDF 标注
- [ ] macOS 代码签名与公证
- [ ] 自动更新

---

## 许可证

MIT © ZenNote

---

## 致谢

站在巨人的肩膀上：

- [Tiptap](https://tiptap.dev) — 无头编辑器框架
- [Tauri](https://tauri.app) — 跨平台桌面运行时
- [React](https://react.dev) — UI 库
- [Vite](https://vitejs.dev) — 下一代构建工具
- [Mermaid](https://mermaid.js.org) — 图表渲染
- [KaTeX](https://katex.org) — 数学排版
- [react-force-graph](https://github.com/vasturiano/react-force-graph) — 知识图谱

灵感来源于 [Typora](https://typora.io)、[Obsidian](https://obsidian.md)、[思源笔记](https://b3log.org/siyuan/)、[Notion](https://notion.so)、[Bear](https://bear.app)、[Sublime Text](https://sublimetext.com) 和 [VSCode](https://code.visualstudio.com)。
