import { contextBridge, ipcRenderer } from 'electron';

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getNotes: (mode?: 'local' | 'cloud') => ipcRenderer.invoke('get-notes', mode),
  getNote: (id: number, mode?: 'local' | 'cloud') => ipcRenderer.invoke('get-note', id, mode),
  createNote: (title: string, mode?: 'local' | 'cloud', category?: string) => ipcRenderer.invoke('create-note', title, mode, category),
    updateNote: (id: number, title: string, content: string, mode?: 'local' | 'cloud', category?: string) =>
      ipcRenderer.invoke('update-note', id, title, content, mode, category),
    updateNoteCategory: (id: number, category: string, mode?: 'local' | 'cloud') =>
      ipcRenderer.invoke('update-note-category', id, category, mode),
  deleteNote: (id: number, mode?: 'local' | 'cloud') => ipcRenderer.invoke('delete-note', id, mode),
  saveImage: (imageData: string, noteId: number, mode?: 'local' | 'cloud') => 
    ipcRenderer.invoke('save-image', imageData, noteId, mode),
  getImage: (imageId: number, mode?: 'local' | 'cloud') => ipcRenderer.invoke('get-image', imageId, mode),
  // 云端数据库配置
  selectConfigFile: () => ipcRenderer.invoke('select-config-file'),
  connectCloudDB: (config: MySQLConfig) => ipcRenderer.invoke('connect-cloud-db', config),
  testCloudDB: (config: MySQLConfig) => ipcRenderer.invoke('test-cloud-db', config),
  getCloudConfig: () => ipcRenderer.invoke('get-cloud-config'),
  getFullCloudConfig: () => ipcRenderer.invoke('get-full-cloud-config'),
  requestPassword: () => ipcRenderer.invoke('request-password'),
  savePassword: (password: string) => ipcRenderer.invoke('save-password', password),
  disconnectCloudDB: () => ipcRenderer.invoke('disconnect-cloud-db'),
  clearCloudConfig: () => ipcRenderer.invoke('clear-cloud-config'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  showConfigProgressDialog: () => ipcRenderer.invoke('show-config-progress-dialog'),
  closeConfigProgressDialog: () => ipcRenderer.invoke('close-config-progress-dialog'),
  showConfigSuccessDialog: () => ipcRenderer.invoke('show-config-success-dialog'),
  showRestartQuitDialog: () => ipcRenderer.invoke('show-restart-quit-dialog'),
  showConfirmDialog: (message: string, title?: string) => ipcRenderer.invoke('show-confirm-dialog', message, title),
  showAlertDialog: (message: string, title?: string) => ipcRenderer.invoke('show-alert-dialog', message, title),
  // 导出笔记
  exportNotes: (mode?: 'local' | 'cloud') => ipcRenderer.invoke('export-notes', mode),
  // 切换笔记置顶
  togglePinNote: (id: number, mode?: 'local' | 'cloud') => ipcRenderer.invoke('toggle-pin-note', id, mode),
  // 保存和获取模式
  saveMode: (mode: 'local' | 'cloud', selectedCategory?: string) => ipcRenderer.invoke('save-mode', mode, selectedCategory),
  getMode: () => ipcRenderer.invoke('get-mode'),
  // 保存和获取个性签名
  saveSignature: (signature: string) => ipcRenderer.invoke('save-signature', signature),
  // 保存选中的分组
  saveSelectedCategory: (selectedCategory: string) => ipcRenderer.invoke('save-selected-category', selectedCategory),
  // 监听菜单事件
  onMenuExport: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu-export-notes', handler);
    return () => {
      ipcRenderer.removeListener('menu-export-notes', handler);
    };
  },
  // 请求主窗口和 webContents 获得焦点（解决编辑问题）
  focusWindow: () => ipcRenderer.invoke('focus-window'),
});

