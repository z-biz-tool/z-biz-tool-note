import { electronAPI, mustSucceed } from '../lib/electronAPI';
import { prepareMarkdownForWrite } from '../lib/markdownWrite';
import type { Note } from '../types';

export const useFileOperations = () => {
  const readFile = async (filePath: string) => {
    return electronAPI.invoke('read-file', filePath);
  };

  const readFileBinary = async (filePath: string) => {
    return electronAPI.invoke('read-file-binary', filePath);
  };

  const getFileMeta = async (filePath: string) => {
    return electronAPI.invoke('get-file-meta', filePath);
  };

  const writeFile = async (filePath: string, content: string) => {
    const prepared = prepareMarkdownForWrite(filePath, content);
    // mustSucceed：保存路径全靠 try/catch 决定"要不要清 WAL、要不要 toast 已保存"，
    // 桥层把 Rust 报错咽成 {success:false} 的话，写盘失败会被当成保存成功（内容就此丢掉）
    const result = await electronAPI.invoke('write-file', filePath, prepared);
    return mustSucceed(result);
  };

  const showSaveDialog = async (defaultPath: string) => {
    return electronAPI.invoke('show-save-dialog', defaultPath);
  };

  const showOpenDialog = async () => {
    return electronAPI.invoke('show-open-dialog');
  };

  const listFiles = async (dirPath: string) => {
    return electronAPI.invoke('list-files', dirPath);
  };

  const listFilesRecursive = async (dirPath: string) => {
    return electronAPI.invoke('list-files-recursive', dirPath);
  };

  const exportHtml = async (content: string, filePath: string) => {
    return electronAPI.invoke('export-html', content, filePath);
  };

  const exportPdf = async (content: string, filePath: string) => {
    return electronAPI.invoke('export-pdf', content, filePath);
  };

  const searchInFiles = async (dirPath: string, query: string) => {
    return electronAPI.invoke('search-in-files', dirPath, query);
  };

  const saveImage = async (imageData: string) => {
    return electronAPI.invoke('save-image', imageData);
  };

  const createNewNote = (): Note => ({
    id: `note-${Date.now()}`,
    title: '未命名',
    content: '',
    filePath: '',
    // 新建的必定是 markdown 笔记；这里留空会让状态栏/ Frontmatter 面板
    // （都按 fileType === 'markdown' 判定）在新笔记上整块消失。
    fileType: 'markdown',
    lastModified: new Date().toISOString(),
    isDirty: false,
  });

  return {
    readFile,
    readFileBinary,
    getFileMeta,
    writeFile,
    showSaveDialog,
    showOpenDialog,
    listFiles,
    listFilesRecursive,
    exportHtml,
    exportPdf,
    searchInFiles,
    saveImage,
    createNewNote,
  };
};
