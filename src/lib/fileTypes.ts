// 文件类型路由：根据扩展名决定点开后的渲染形态
// 形态分类: markdown / code(只读+语法高亮) / image / video / audio / pdf / docx / xlsx / csv / binary

export type FileKind =
  | 'markdown'   // .md / .markdown → tiptap 编辑器
  | 'code'       // 纯文本/代码 (只读,语法高亮)
  | 'image'      // 图片查看器
  | 'video'      // 视频播放器
  | 'audio'      // 音频播放器
  | 'pdf'        // PDF.js 内嵌
  | 'docx'       // mammoth → HTML
  | 'xlsx'       // SheetJS → 表格
  | 'csv'        // 表格渲染
  | 'binary';    // 未知/二进制: 元信息 + hex 预览

const EXT_MAP: Record<string, FileKind> = {
  // markdown
  md: 'markdown',
  markdown: 'markdown',

  // 图片
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  heic: 'image', heif: 'image',

  // 音视频
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  m4a: 'audio', aac: 'audio',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',

  // 文档
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',

  // 表格
  csv: 'csv', tsv: 'csv',

  // 文本/代码 (统一走 code viewer,带语法高亮)
  txt: 'code', log: 'code', conf: 'code', ini: 'code', env: 'code',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code', toml: 'code',
  html: 'code', htm: 'code', css: 'code', scss: 'code', less: 'code',
  js: 'code', mjs: 'code', cjs: 'code', jsx: 'code',
  ts: 'code', tsx: 'code',
  py: 'code', rs: 'code', go: 'code', java: 'code',
  kt: 'code', kts: 'code', swift: 'code',
  c: 'code', h: 'code', cpp: 'code', cc: 'code', cxx: 'code', hpp: 'code',
  cs: 'code', rb: 'code', php: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code',
  sql: 'code', vue: 'code', svelte: 'code',
  gradle: 'code', properties: 'code', dockerfile: 'code',
};

export const CODE_LANG_MAP: Record<string, string> = {
  // 文本类
  txt: 'plaintext', log: 'plaintext', conf: 'plaintext', ini: 'plaintext', env: 'plaintext',
  // 数据类
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  // Web
  html: 'xml', htm: 'xml', css: 'css', scss: 'scss', less: 'less',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx', vue: 'xml', svelte: 'xml',
  // 主流语言
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  kt: 'kotlin', kts: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'cs', rb: 'ruby', php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'shell',
  sql: 'sql',
  gradle: 'groovy', properties: 'properties', dockerfile: 'dockerfile',
};

export function extOf(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  if (lastDot <= lastSlash || lastDot === -1) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

export function baseName(filename: string): string {
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  return slash >= 0 ? filename.substring(slash + 1) : filename;
}

export function kindOf(filename: string): FileKind {
  const ext = extOf(filename);
  return EXT_MAP[ext] ?? 'binary';
}

export function codeLangOf(filename: string): string {
  const ext = extOf(filename);
  return CODE_LANG_MAP[ext] ?? 'plaintext';
}

export function mimeOf(filename: string): string {
  const ext = extOf(filename);
  return guessMime(ext);
}

function guessMime(ext: string): string {
  const m: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', ico: 'image/x-icon', heic: 'image/heic', heif: 'image/heic',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    m4a: 'audio/mp4', aac: 'audio/aac',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return m[ext] ?? 'application/octet-stream';
}

export function isEditable(kind: FileKind): boolean {
  // 哪些类型可以"编辑"(其他都只读)
  return kind === 'markdown';
}

export const KIND_LABEL: Record<FileKind, string> = {
  markdown: 'Markdown',
  code: '代码',
  image: '图片',
  video: '视频',
  audio: '音频',
  pdf: 'PDF',
  docx: 'Word 文档',
  xlsx: 'Excel 表格',
  csv: 'CSV 表格',
  binary: '二进制',
};
