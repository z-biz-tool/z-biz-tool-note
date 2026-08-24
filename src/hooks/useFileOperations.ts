import { electronAPI } from '../lib/electronAPI';
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
    return electronAPI.invoke('write-file', filePath, content);
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
    title: 'Untitled',
    content: '',
    filePath: '',
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
