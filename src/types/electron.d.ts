export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: number; // 0 = 未置顶, 1 = 置顶
  category?: string; // 分组名称，空字符串或null表示未分组
}

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

declare global {
  interface Window {
    electronAPI: {
      getNotes: (mode?: 'local' | 'cloud') => Promise<Note[]>;
      getNote: (id: number, mode?: 'local' | 'cloud') => Promise<Note | null>;
      createNote: (title: string, mode?: 'local' | 'cloud', category?: string) => Promise<Note | null>;
      updateNote: (id: number, title: string, content: string, mode?: 'local' | 'cloud', category?: string) => Promise<boolean>;
      updateNoteCategory: (id: number, category: string, mode?: 'local' | 'cloud') => Promise<boolean>;
      deleteNote: (id: number, mode?: 'local' | 'cloud') => Promise<boolean>;
      saveImage: (imageData: string, noteId: number, mode?: 'local' | 'cloud') => Promise<number | null>;
      getImage: (imageId: number, mode?: 'local' | 'cloud') => Promise<string | null>;
      // 云端数据库配置
      selectConfigFile: () => Promise<{ success: boolean; error?: string; config?: { host: string; port: number; database: string; user: string } }>;
      connectCloudDB: (config: MySQLConfig) => Promise<{ success: boolean; error?: string }>;
      testCloudDB: (config: MySQLConfig) => Promise<{ success: boolean; error?: string }>;
      getCloudConfig: () => Promise<{ host: string; port: number; database: string; user: string } | null>;
      getFullCloudConfig: () => Promise<MySQLConfig | null>;
      requestPassword: () => Promise<string | null>;
      savePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
      disconnectCloudDB: () => Promise<{ success: boolean }>;
      clearCloudConfig: () => Promise<{ success: boolean; error?: string }>;
      // 导出笔记
      exportNotes: (mode?: 'local' | 'cloud') => Promise<{ success: boolean; error?: string; filePath?: string }>;
      // 切换笔记置顶
      togglePinNote: (id: number, mode?: 'local' | 'cloud') => Promise<boolean>;
      // 保存和获取模式
      saveMode: (mode: 'local' | 'cloud', selectedCategory?: string) => Promise<{ success: boolean; error?: string }>;
      getMode: () => Promise<{ mode: 'local' | 'cloud'; selectedCategory: string; signature?: string }>;
      // 保存个性签名
      saveSignature: (signature: string) => Promise<{ success: boolean; error?: string }>;
      // 保存选中的分组
      saveSelectedCategory: (selectedCategory: string) => Promise<{ success: boolean; error?: string }>;
      // 监听菜单事件
      onMenuExport?: (callback: () => void) => () => void;
      // 请求主窗口和 webContents 获得焦点（解决编辑问题）
      focusWindow: () => Promise<{ success: boolean }>;
      // 重启应用
      restartApp: () => Promise<{ success: boolean }>;
      // 关闭应用
      quitApp: () => Promise<{ success: boolean }>;
      // 显示配置中提示对话框
      showConfigProgressDialog: () => Promise<{ success: boolean }>;
      // 关闭配置中对话框
      closeConfigProgressDialog: () => Promise<{ success: boolean }>;
      // 显示配置完成提示对话框
      showConfigSuccessDialog: () => Promise<void>;
      // 显示重启/关闭选择对话框
      showRestartQuitDialog: () => Promise<'restart' | 'quit' | null>;
      // 显示确认对话框
      showConfirmDialog: (message: string, title?: string) => Promise<boolean>;
      // 显示提示对话框（替换 alert）
      showAlertDialog: (message: string, title?: string) => Promise<void>;
    };
  }
}

export {};

