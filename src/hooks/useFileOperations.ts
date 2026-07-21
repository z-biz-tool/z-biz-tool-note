import { ipcRenderer } from 'electron';
import type { FileItem, Note } from '../types';

export const useFileOperations = () => {
  const readFile = async (filePath: string): Promise<{ success: boolean; content?: string; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke('read-file', filePath);
  };

  const writeFile = async (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('write-file', filePath, content);
  };

  const showSaveDialog = async (defaultPath: string): Promise<{ canceled: boolean; filePath?: string }> => {
    return ipcRenderer.invoke('show-save-dialog', defaultPath);
  };

  const showOpenDialog = async (): Promise<{ canceled: boolean; filePath?: string }> => {
    return ipcRenderer.invoke('show-open-dialog');
  };

  const listFiles = async (dirPath: string): Promise<{ success: boolean; files?: FileItem[]; error?: string }> => {
    return ipcRenderer.invoke('list-files', dirPath);
  };

  const exportHtml = async (content: string, filePath: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return ipcRenderer.invoke('export-html', content, filePath);
  };

  const createNewNote = (): Note => ({
    id: `note-${Date.now()}`,
    title: 'Untitled',
    content: '',
    filePath: '',
    lastModified: new Date(),
    isDirty: false,
  });

  return {
    readFile,
    writeFile,
    showSaveDialog,
    showOpenDialog,
    listFiles,
    exportHtml,
    createNewNote,
  };
};