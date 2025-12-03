import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Database, Note } from './database';
import { CloudDatabase, MySQLConfig } from './cloudDatabase';

let mainWindow: BrowserWindow | null = null;
let db: Database | null = null;
let cloudDb: CloudDatabase | null = null;

// 配置文件路径
const getConfigPath = () => {
  return path.join(app.getPath('userData'), 'cloud-config.json');
};

// 密码文件路径（加密存储）
const getPasswordPath = () => {
  return path.join(app.getPath('userData'), 'cloud-password.enc');
};

// 生成加密密钥（基于机器信息，确保每次运行一致）
const getEncryptionKey = (): Buffer => {
  // 使用用户数据目录路径作为密钥基础（每个用户不同，但同一用户一致）
  const keyBase = app.getPath('userData');
  // 使用 SHA256 生成固定长度的密钥
  return crypto.createHash('sha256').update(keyBase).digest();
};

// 加密密码
const encryptPassword = (password: string): string => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // 初始化向量
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 将 IV 和加密数据组合：IV(16字节hex) + 加密数据
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('加密密码失败:', error);
    throw error;
  }
};

// 解密密码
const decryptPassword = (encryptedData: string): string => {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('无效的加密数据格式');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('解密密码失败:', error);
    throw error;
  }
};

// 加载云端配置（不包含密码）
interface CloudConfigWithoutPassword {
  host: string;
  port: number;
  database: string;
  user: string;
}

const loadCloudConfig = (): CloudConfigWithoutPassword | null => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载云端配置失败:', error);
  }
  return null;
};

// 保存云端配置（不包含密码）
const saveCloudConfig = (config: CloudConfigWithoutPassword): void => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存云端配置失败:', error);
  }
};

// 保存加密的密码
const saveEncryptedPassword = (password: string): void => {
  try {
    const passwordPath = getPasswordPath();
    const encrypted = encryptPassword(password);
    fs.writeFileSync(passwordPath, encrypted, 'utf-8');
  } catch (error) {
    console.error('保存密码失败:', error);
    throw error;
  }
};

// 加载并解密密码
const loadDecryptedPassword = (): string | null => {
  try {
    const passwordPath = getPasswordPath();
    if (fs.existsSync(passwordPath)) {
      const encrypted = fs.readFileSync(passwordPath, 'utf-8');
      return decryptPassword(encrypted);
    }
  } catch (error) {
    console.error('加载密码失败:', error);
  }
  return null;
};

// 获取完整的配置（包含密码）
const getFullConfig = (): MySQLConfig | null => {
  const config = loadCloudConfig();
  if (!config) {
    return null;
  }
  
  const password = loadDecryptedPassword();
  if (!password) {
    return null;
  }
  
  return {
    ...config,
    password
  };
};

function createWindow() {
  console.log('创建 Electron 窗口...');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('preload 路径:', path.join(__dirname, 'preload.js'));
  
  // 设置应用图标路径
  // 在开发模式下，从项目根目录查找图标
  // 在生产模式下，从构建目录查找图标
  const isDev = process.env.NODE_ENV === 'development' || 
                process.env.ELECTRON_IS_DEV === '1' ||
                (process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath));
  
  let icon: string | undefined;
  if (isDev) {
    // 开发模式：从项目根目录查找
    const devIconPath = path.join(__dirname, '../../build/icon.png');
    const devIconPathJpg = path.join(__dirname, '../../image.jpg');
    if (fs.existsSync(devIconPath)) {
      icon = devIconPath;
    } else if (fs.existsSync(devIconPathJpg)) {
      icon = devIconPathJpg;
    }
  } else {
    // 生产模式：从构建目录查找
    const prodIconPath = path.join(__dirname, '../build/icon.png');
    if (fs.existsSync(prodIconPath)) {
      icon = prodIconPath;
    }
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'MyNote2',
    icon: icon, // 设置窗口图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  console.log('开发模式:', isDev);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('__dirname:', __dirname);

  if (isDev) {
    console.log('加载开发服务器: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, 'renderer/index.html');
    console.log('加载生产文件:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('ready-to-show', () => {
    console.log('窗口已准备好显示');
    if (mainWindow) {
      mainWindow.show();
    }
  });

  console.log('窗口创建完成');
}

// 创建应用菜单
function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '导出所有笔记',
          accelerator: 'CmdOrCtrl+E',
          click: async () => {
            if (mainWindow) {
              // 发送消息给渲染进程，让它调用导出功能
              mainWindow.webContents.send('menu-export-notes');
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '切换开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '云端配置',
          click: () => {
            showCloudConfigGuide();
          }
        },
        { type: 'separator' },
        {
          label: '关于 MyNote2',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '关于 MyNote2',
              message: 'MyNote2',
              detail: '一个支持本地和云端模式的笔记软件\n\n版本 1.0.0\n\n版权所有\n联系人：yeshixin\n联系邮箱：yeshixin@qq.com'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 显示云端配置指南
function showCloudConfigGuide() {
  const guideWindow = new BrowserWindow({
    width: 900,
    height: 700,
    parent: mainWindow || undefined,
    modal: false,
    resizable: true,
    frame: false, // 无边框窗口，去掉工具栏和标题栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  guideWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>云端 MySQL 配置指南</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
          padding: 0;
          background: #f5f5f5;
          line-height: 1.6;
          color: #333;
          margin: 0;
        }
        .title-bar {
          background: #667eea;
          color: white;
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          user-select: none;
          -webkit-app-region: drag;
        }
        .title-bar h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
        }
        .close-btn {
          background: transparent;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0 10px;
          -webkit-app-region: no-drag;
        }
        .close-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .content-wrapper {
          padding: 20px;
          overflow-y: auto;
          height: calc(100vh - 50px);
        }
        .container {
          max-width: 850px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #667eea;
          margin-bottom: 10px;
          font-size: 24px;
        }
        h2 {
          color: #333;
          margin-top: 30px;
          margin-bottom: 15px;
          font-size: 18px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 5px;
        }
        h3 {
          color: #555;
          margin-top: 20px;
          margin-bottom: 10px;
          font-size: 16px;
        }
        p {
          margin-bottom: 15px;
          color: #666;
        }
        .code-block {
          background: #f8f8f8;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 15px;
          margin: 15px 0;
          overflow-x: auto;
          position: relative;
        }
        .code-block code {
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #333;
          white-space: pre;
          display: block;
        }
        .copy-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 5px 12px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          opacity: 0.8;
        }
        .copy-btn:hover {
          opacity: 1;
        }
        .code-block:hover .copy-btn {
          opacity: 1;
        }
        .note {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 12px;
          margin: 15px 0;
          border-radius: 4px;
        }
        .warning {
          background: #f8d7da;
          border-left: 4px solid #dc3545;
          padding: 12px;
          margin: 15px 0;
          border-radius: 4px;
        }
        .success {
          background: #d4edda;
          border-left: 4px solid #28a745;
          padding: 12px;
          margin: 15px 0;
          border-radius: 4px;
        }
        ul, ol {
          margin-left: 25px;
          margin-bottom: 15px;
        }
        li {
          margin-bottom: 8px;
          color: #666;
        }
        .step-number {
          display: inline-block;
          width: 24px;
          height: 24px;
          background: #667eea;
          color: white;
          border-radius: 50%;
          text-align: center;
          line-height: 24px;
          font-weight: bold;
          margin-right: 10px;
        }
      </style>
    </head>
    <body>
      <div class="title-bar">
        <h1>📚 云端 MySQL 配置指南</h1>
        <button class="close-btn" onclick="window.close()">×</button>
      </div>
      <div class="content-wrapper">
        <div class="container">
        <p>本指南将帮助您从零开始配置云端 MySQL 数据库，以便在 MyNote2 中使用云端模式。</p>

        <h2>一、准备工作</h2>
        <p>确保您已经拥有一台 Linux 云服务器，并且已经安装了 MySQL 数据库。</p>

        <h2>二、创建数据库用户</h2>
        <p>首先，以 root 用户登录 MySQL：</p>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>mysql -u root -p</code>
        </div>

        <h3>步骤 1：创建数据库</h3>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>CREATE DATABASE IF NOT EXISTS mynote2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;</code>
        </div>

        <h3>步骤 2：创建用户并授权</h3>
        <p>创建一个新用户（例如：ysx），并授予对 mynote2 数据库的所有权限：</p>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>CREATE USER IF NOT EXISTS 'ysx'@'%' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON mynote2.* TO 'ysx'@'%';
FLUSH PRIVILEGES;</code>
        </div>
        <div class="note">
          <strong>💡 提示：</strong>将 'ysx' 替换为您想要的用户名，将 '你的密码' 替换为强密码。'%' 表示允许从任何主机连接，如果只想允许特定 IP，可以替换为具体 IP 地址。
        </div>

        <h3>步骤 3：验证用户权限</h3>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>SHOW GRANTS FOR 'ysx'@'%';</code>
        </div>

        <h2>三、创建数据表</h2>
        <p>使用新创建的用户登录 MySQL：</p>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>mysql -u ysx -p mynote2</code>
        </div>

        <p>执行以下建表脚本创建数据表：</p>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>-- 我的笔记 - MySQL 建表脚本
-- 数据库名：mynote2

USE mynote2;

-- 创建笔记表
-- 注意：content 使用 LONGTEXT 以支持存储包含大量 base64 图片的内容
CREATE TABLE IF NOT EXISTS notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  isPinned INT DEFAULT 0,
  category VARCHAR(100),
  INDEX idx_updated_at (updatedAt DESC),
  INDEX idx_is_pinned (isPinned DESC),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建图片表
CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  noteId INT NOT NULL,
  data LONGTEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE,
  INDEX idx_note_id (noteId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证表是否创建成功
SELECT 'notes 表创建成功' AS status;
SELECT 'images 表创建成功' AS status;

-- 查看表结构
DESCRIBE notes;
DESCRIBE images;</code>
        </div>

        <h2>四、配置 MyNote2</h2>
        <h3>步骤 1：创建配置文件</h3>
        <p>在项目根目录创建 <code>cloud-config-template.json</code> 文件（或使用已有的模板文件），内容如下：</p>
        <div class="code-block">
          <button class="copy-btn" onclick="copyCode(this)">复制</button>
          <code>{
  "host": "您的服务器IP地址",
  "port": 3306,
  "database": "mynote2",
  "user": "ysx"
}</code>
        </div>
        <div class="note">
          <strong>💡 提示：</strong>配置文件中不包含密码字段，密码将在 MyNote2 中手动输入并加密存储。
        </div>

        <h3>步骤 2：在 MyNote2 中配置</h3>
        <ol>
          <li>切换到"云端模式"</li>
          <li>点击"配置数据库"按钮</li>
          <li>选择刚才创建的 JSON 配置文件</li>
          <li>在弹出的密码输入框中输入数据库用户密码</li>
          <li>系统会自动测试连接并保存配置</li>
        </ol>

        <h2>五、验证配置</h2>
        <p>配置完成后，您可以在 MyNote2 中：</p>
        <ul>
          <li>创建新笔记，验证数据是否成功保存到云端</li>
          <li>在 MySQL 中查询验证：<code>SELECT * FROM mynote2.notes LIMIT 5;</code></li>
        </ul>

        <div class="success">
          <strong>✅ 完成！</strong>现在您可以在 MyNote2 中使用云端模式了。所有笔记数据将存储在您的云服务器上，可以在多台设备间同步。
        </div>
        </div>
      </div>

      <script>
        function copyCode(btn) {
          const codeBlock = btn.nextElementSibling;
          const text = codeBlock.textContent;
          
          // 创建临时文本区域
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          
          try {
            document.execCommand('copy');
            const originalText = btn.textContent;
            btn.textContent = '已复制！';
            btn.style.background = '#28a745';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.style.background = '#667eea';
            }, 2000);
          } catch (err) {
            alert('复制失败，请手动选择文本复制');
          }
          
          document.body.removeChild(textarea);
        }
      </script>
    </body>
    </html>
  `)}`);

  guideWindow.setTitle('云端 MySQL 配置指南');
}

// 单实例锁定：确保同一时间只能运行一个应用实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已经有实例在运行，退出新实例
  console.log('应用已经在运行，退出新实例');
  app.quit();
} else {
  // 监听第二个实例启动事件
  app.on('second-instance', () => {
    // 当用户尝试打开第二个实例时，激活现有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

app.whenReady().then(async () => {
  try {
    // 初始化数据库（同步操作，快速完成）
    console.log('正在初始化数据库...');
    db = new Database();
    console.log('数据库初始化成功');
    
    // 创建菜单
    createMenu();
    
    // 立即创建窗口，不等待云端数据库连接
    createWindow();

    // 异步预先连接云端数据库（如果已配置），不阻塞启动
    // 使用 setTimeout 确保窗口先显示，然后再连接数据库
    setTimeout(async () => {
      const fullConfig = getFullConfig();
      if (fullConfig) {
        console.log('检测到云端配置，后台连接数据库...');
        try {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(fullConfig);
          console.log('云端数据库后台连接成功');
        } catch (error) {
          console.error('云端数据库后台连接失败（将在使用时重试）:', error);
          cloudDb = null;
        }
      }
    }, 100); // 延迟100ms，让窗口先显示

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('应用启动失败:', error);
  }
});
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理程序 - 云端数据库配置
ipcMain.handle('connect-cloud-db', async (_, config: MySQLConfig) => {
  try {
    if (cloudDb) {
      cloudDb.disconnect();
    }
    cloudDb = new CloudDatabase();
    await cloudDb.connect(config);
    saveCloudConfig(config);
    return { success: true };
  } catch (error) {
    console.error('连接云端数据库失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('test-cloud-db', async (_, config: MySQLConfig) => {
  try {
    const testDb = new CloudDatabase();
    await testDb.connect(config);
    testDb.disconnect();
    return { success: true };
  } catch (error) {
    console.error('测试云端数据库连接失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 选择并读取 JSON 配置文件
ipcMain.handle('select-config-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择数据库配置文件',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, error: '用户取消选择' };
    }

    const filePath = result.filePaths[0];
    
    // 读取 JSON 文件
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(fileContent);

    // 验证配置格式
    if (!config.host || !config.port || !config.database || !config.user) {
      return { 
        success: false, 
        error: '配置文件格式错误：缺少必需的字段（host, port, database, user）' 
      };
    }

    // 确保不包含密码
    const configWithoutPassword: CloudConfigWithoutPassword = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user
    };

    return { success: true, config: configWithoutPassword };
  } catch (error) {
    console.error('读取配置文件失败:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '读取配置文件失败' 
    };
  }
});

// 获取云端配置（不包含密码）
ipcMain.handle('get-cloud-config', async () => {
  return loadCloudConfig();
});

// 请求输入密码（显示对话框）
ipcMain.handle('request-password', async () => {
  return new Promise<string | null>((resolve) => {
    // 直接创建密码输入窗口，不再显示消息框
    const passwordWindow = new BrowserWindow({
          width: 380,
          height: 160,
          show: false,
          parent: mainWindow || undefined,
          modal: true,
          resizable: false,
          frame: false, // 无边框窗口
          transparent: true, // 透明背景
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });

        passwordWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>输入数据库密码</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              html, body {
                width: 100%;
                height: 100%;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
              }
              body {
                background: transparent;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: #ffffff;
                padding: 40px;
                border-radius: 0;
                border: 2px solid #000000;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                gap: 20px;
              }
              input {
                width: 100%;
                padding: 14px 18px;
                border: 2px solid #ddd;
                border-radius: 0;
                font-size: 15px;
                background: #ffffff;
                color: #333;
                transition: all 0.3s;
              }
              input:focus {
                outline: none;
                border-color: #667eea;
                background: white;
                box-shadow: 0 0 0 3px rgba(102,126,234,0.2);
              }
              input::placeholder {
                color: #999;
              }
              .buttons {
                display: flex;
                gap: 12px;
                width: 100%;
              }
              button {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 0;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
              }
              .ok-btn {
                background: #667eea;
                color: white;
              }
              .ok-btn:hover {
                background: #5568d3;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              }
              .ok-btn:active {
                transform: translateY(0);
              }
              .cancel-btn {
                background: #f5f5f5;
                color: #333;
                border: 2px solid #ddd;
              }
              .cancel-btn:hover {
                background: #e0e0e0;
                border-color: #bbb;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <input type="password" id="password" placeholder="请输入数据库密码" autofocus />
              <div class="buttons">
                <button class="cancel-btn" onclick="cancel()">取消</button>
                <button class="ok-btn" onclick="confirm()">确定</button>
              </div>
            </div>
            <script>
              const { ipcRenderer } = require('electron');
              const input = document.getElementById('password');
              
              // 关键：确保窗口加载完成后立即聚焦输入框
              // 这和主窗口编辑器无法编辑的问题是一样的：都需要 webContents 获得系统焦点
              function focusInput() {
                // 确保窗口有焦点
                window.focus();
                // 立即聚焦输入框
                input.focus();
                // 如果失败，使用 requestAnimationFrame 重试
                if (document.activeElement !== input) {
                  requestAnimationFrame(() => {
                    input.focus();
                    // 如果还是失败，再延迟一点重试
                    if (document.activeElement !== input) {
                      setTimeout(() => {
                        input.focus();
                      }, 50);
                    }
                  });
                }
              }
              
              // DOM 加载完成后立即聚焦
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', focusInput);
              } else {
                focusInput();
              }
              
              // 窗口获得焦点时也聚焦输入框
              window.addEventListener('focus', focusInput);
              
              input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                  confirm();
                }
              });
              
              function confirm() {
                const password = input.value;
                ipcRenderer.send('password-input-result', password || null);
                window.close();
              }
              
              function cancel() {
                ipcRenderer.send('password-input-result', null);
                window.close();
              }
            </script>
          </body>
          </html>
        `)}`);

    // 关键：等待窗口加载完成后，确保 webContents 获得焦点，然后聚焦输入框
    // 这和主窗口编辑器无法编辑的问题是一样的根本原因
    passwordWindow.webContents.once('did-finish-load', () => {
      // 先显示窗口
      passwordWindow.show();
      // 让窗口获得焦点
      passwordWindow.focus();
      // 关键：让 webContents 也获得焦点（这是让输入框自动聚焦的关键）
      passwordWindow.webContents.focus();
      
      // 使用 executeJavaScript 确保输入框获得焦点
      passwordWindow.webContents.executeJavaScript(`
        (function() {
          const input = document.getElementById('password');
          if (input) {
            // 确保窗口有焦点
            window.focus();
            // 立即聚焦输入框
            input.focus();
            // 如果失败，使用 requestAnimationFrame 重试
            if (document.activeElement !== input) {
              requestAnimationFrame(() => {
                input.focus();
                // 如果还是失败，再延迟一点重试
                if (document.activeElement !== input) {
                  setTimeout(() => {
                    input.focus();
                  }, 50);
                }
              });
            }
          }
        })();
      `).catch(err => console.error('聚焦密码输入框失败:', err));
    });

    // 监听来自窗口的密码返回
    ipcMain.once('password-input-result', (_, password: string | null) => {
      passwordWindow.close();
      // 确保主窗口重新获得焦点，并触发 focus 事件
      if (mainWindow && !mainWindow.isDestroyed()) {
        // 先让密码窗口完全关闭
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            // 确保窗口显示并获得焦点
            mainWindow.show();
            mainWindow.focus();
            // 关键：让 webContents 也获得焦点，这样才能触发 window focus 事件
            mainWindow.webContents.focus();
            
            // 手动触发 focus 事件到渲染进程
            mainWindow.webContents.executeJavaScript(`
              // 触发 window focus 事件，让 React 组件能够响应
              window.dispatchEvent(new Event('focus'));
              // 确保编辑器可编辑
              const editorElement = document.querySelector('.editor-content');
              if (editorElement) {
                editorElement.contentEditable = 'true';
                if (editorElement.contentEditable !== 'true') {
                  editorElement.removeAttribute('contenteditable');
                  editorElement.setAttribute('contenteditable', 'true');
                }
              }
              // 确保标题和分组输入框可编辑
              const titleInput = document.querySelector('.title-input');
              if (titleInput) {
                titleInput.disabled = false;
                titleInput.readOnly = false;
              }
              const categoryInput = document.querySelector('input[list="categories-list"]');
              if (categoryInput) {
                categoryInput.disabled = false;
                categoryInput.readOnly = false;
              }
            `).catch(err => console.error('执行 JavaScript 失败:', err));
          }
        }, 100);
      }
      resolve(password);
    });
  });
});

// 保存密码（加密存储）
ipcMain.handle('save-password', async (_, password: string) => {
  try {
    saveEncryptedPassword(password);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

// 获取完整配置（包含密码，如果已保存）
ipcMain.handle('get-full-cloud-config', async () => {
  return getFullConfig();
});

ipcMain.handle('disconnect-cloud-db', async () => {
  if (cloudDb) {
    cloudDb.disconnect();
    cloudDb = null;
  }
  return { success: true };
});

// 清除云端配置（断开数据库，需要重新配置）
// 请求主窗口和 webContents 获得焦点（解决编辑问题）
ipcMain.handle('focus-window', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
    // 多次尝试，确保焦点切换完成
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
      }
    }, 10);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
      }
    }, 50);
    return { success: true };
  }
  return { success: false };
});

// 重启应用
ipcMain.handle('restart-app', async () => {
  app.relaunch();
  app.quit();
  return { success: true };
});

// 关闭应用
ipcMain.handle('quit-app', async () => {
  app.quit();
  return { success: true };
});

// 显示配置中提示对话框
ipcMain.handle('show-config-progress-dialog', async () => {
  // 如果已经有一个配置中对话框，先关闭它
  const existingDialog = (global as any).configProgressDialog;
  if (existingDialog && !existingDialog.isDestroyed()) {
    existingDialog.close();
  }

  const dialogWindow = new BrowserWindow({
    width: 350,
    height: 120,
    show: false,
    parent: mainWindow || undefined,
    modal: true,
    resizable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>配置中</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
        }
        body {
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: #ffffff;
          padding: 32px 28px;
          border-radius: 0;
          border: 1px solid #e0e0e0;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 16px;
        }
        .message {
          font-size: 15px;
          color: #555;
          text-align: center;
          line-height: 1.6;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <div class="message">配置中...</div>
      </div>
    </body>
    </html>
  `)}`);

  // 等待窗口加载完成后显示，然后立即返回（不阻塞）
  dialogWindow.webContents.once('did-finish-load', () => {
    dialogWindow.show();
    dialogWindow.focus();
    dialogWindow.webContents.focus();
  });

  // 存储窗口引用，以便后续关闭
  (global as any).configProgressDialog = dialogWindow;

  // 窗口关闭时清理引用
  dialogWindow.on('closed', () => {
    if ((global as any).configProgressDialog === dialogWindow) {
      (global as any).configProgressDialog = null;
    }
  });

  // 立即返回，不等待窗口关闭
  return { success: true };
});

// 关闭配置中对话框
ipcMain.handle('close-config-progress-dialog', async () => {
  const dialogWindow = (global as any).configProgressDialog;
  if (dialogWindow && !dialogWindow.isDestroyed()) {
    dialogWindow.close();
    (global as any).configProgressDialog = null;
  }
  return { success: true };
});

// 显示配置完成提示对话框
ipcMain.handle('show-config-success-dialog', async () => {
  return new Promise<void>((resolve) => {
    const dialogWindow = new BrowserWindow({
      width: 400,
      height: 150,
      show: false,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>配置完成</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
          }
          body {
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: #ffffff;
            padding: 32px 28px;
            border-radius: 0;
            border: 1px solid #e0e0e0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 20px;
          }
          .message {
            font-size: 16px;
            color: #333;
            text-align: center;
            line-height: 1.6;
            white-space: pre-line;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="message">配置完毕，正在重启笔记...</div>
        </div>
      </body>
      </html>
    `)}`);

    // 等待窗口加载完成后显示
    dialogWindow.webContents.once('did-finish-load', () => {
      dialogWindow.show();
      dialogWindow.focus();
      
      // 1.5秒后关闭窗口并resolve
      setTimeout(() => {
        dialogWindow.close();
        resolve();
      }, 1500);
    });

    // 窗口关闭时resolve
    dialogWindow.on('closed', () => {
      resolve();
    });
  });
});

// 显示重启/关闭选择对话框
ipcMain.handle('show-restart-quit-dialog', async () => {
  return new Promise<'restart' | 'quit' | null>((resolve) => {
    const dialogWindow = new BrowserWindow({
      width: 420,
      height: 200,
      show: false,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>选择操作</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
          }
          body {
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: #ffffff;
            padding: 32px 28px;
            border-radius: 0;
            border: 1px solid #e0e0e0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .message {
            font-size: 15px;
            color: #333;
            text-align: center;
            line-height: 1.8;
            white-space: pre-line;
            margin-bottom: 24px;
            color: #555;
          }
          .buttons {
            display: flex;
            gap: 10px;
            width: 100%;
            margin-top: 8px;
          }
          button {
            flex: 1;
            padding: 11px 20px;
            border: none;
            border-radius: 0;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            outline: none;
          }
          button:focus {
            outline: 2px solid #667eea;
            outline-offset: 2px;
          }
          .restart-btn {
            background: #667eea;
            color: white;
          }
          .restart-btn:hover {
            background: #5568d3;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          .restart-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 6px rgba(102, 126, 234, 0.2);
          }
          .quit-btn {
            background: #f8f8f8;
            color: #333;
            border: 1px solid #e0e0e0;
          }
          .quit-btn:hover {
            background: #f0f0f0;
            border-color: #d0d0d0;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          .quit-btn:active {
            transform: translateY(0);
            box-shadow: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="message">已断开数据库连接，配置已清除。\n\n请选择操作：</div>
            <div class="buttons">
              <button class="restart-btn" onclick="chooseRestart()">重启笔记</button>
              <button class="quit-btn" onclick="chooseQuit()">关闭应用</button>
            </div>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          
          function chooseRestart() {
            ipcRenderer.send('restart-quit-choice', 'restart');
            window.close();
          }
          
          function chooseQuit() {
            ipcRenderer.send('restart-quit-choice', 'quit');
            window.close();
          }
          
          // 窗口加载完成后自动聚焦第一个按钮
          window.addEventListener('DOMContentLoaded', () => {
            const restartBtn = document.querySelector('.restart-btn');
            if (restartBtn) {
              setTimeout(() => {
                restartBtn.focus();
              }, 100);
            }
          });
          
          // 支持键盘快捷键
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              chooseQuit();
            } else if (e.key === 'Enter') {
              chooseRestart();
            }
          });
        </script>
      </body>
      </html>
    `)}`);

    // 等待窗口加载完成后显示
    dialogWindow.webContents.once('did-finish-load', () => {
      dialogWindow.show();
      dialogWindow.focus();
      dialogWindow.webContents.focus();
    });

    // 监听用户选择
    ipcMain.once('restart-quit-choice', (_, choice: 'restart' | 'quit') => {
      dialogWindow.close();
      resolve(choice);
    });

    // 窗口关闭时返回 null
    dialogWindow.on('closed', () => {
      resolve(null);
    });
  });
});

// 显示确认对话框（用于断开数据库连接等操作）
ipcMain.handle('show-confirm-dialog', async (_, message: string, title: string = '确认') => {
  return new Promise<boolean>((resolve) => {
    const dialogWindow = new BrowserWindow({
      width: 420,
      height: 180,
      show: false,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
          }
          body {
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: #ffffff;
            padding: 28px 32px;
            border-radius: 0;
            border: 1px solid #e0e0e0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .message {
            font-size: 15px;
            color: #333;
            text-align: center;
            line-height: 1.8;
            white-space: pre-line;
            margin-bottom: 24px;
            color: #555;
          }
          .buttons {
            display: flex;
            gap: 10px;
            width: 100%;
            justify-content: flex-end;
            margin-top: 8px;
          }
          button {
            padding: 10px 24px;
            border: none;
            border-radius: 0;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            outline: none;
            min-width: 80px;
          }
          button:focus {
            outline: 2px solid #667eea;
            outline-offset: 2px;
          }
          .cancel-btn {
            background: #f8f8f8;
            color: #333;
            border: 1px solid #e0e0e0;
          }
          .cancel-btn:hover {
            background: #f0f0f0;
            border-color: #d0d0d0;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }
          .cancel-btn:active {
            transform: translateY(0);
            box-shadow: none;
          }
          .confirm-btn {
            background: #667eea;
            color: white;
          }
          .confirm-btn:hover {
            background: #5568d3;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          .confirm-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 6px rgba(102, 126, 234, 0.2);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="message">${message}</div>
            <div class="buttons">
              <button class="cancel-btn" onclick="chooseCancel()">取消</button>
              <button class="confirm-btn" onclick="chooseConfirm()">确定</button>
            </div>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          
          function chooseConfirm() {
            ipcRenderer.send('confirm-dialog-result', true);
            window.close();
          }
          
          function chooseCancel() {
            ipcRenderer.send('confirm-dialog-result', false);
            window.close();
          }
          
          // 窗口加载完成后自动聚焦确认按钮
          window.addEventListener('DOMContentLoaded', () => {
            const confirmBtn = document.querySelector('.confirm-btn');
            if (confirmBtn) {
              setTimeout(() => {
                confirmBtn.focus();
              }, 100);
            }
          });
          
          // 支持键盘快捷键
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              chooseCancel();
            } else if (e.key === 'Enter') {
              chooseConfirm();
            }
          });
        </script>
      </body>
      </html>
    `)}`);

    // 等待窗口加载完成后显示
    dialogWindow.webContents.once('did-finish-load', () => {
      dialogWindow.show();
      dialogWindow.focus();
      dialogWindow.webContents.focus();
    });

    // 监听用户选择
    ipcMain.once('confirm-dialog-result', (_, confirmed: boolean) => {
      dialogWindow.close();
      resolve(confirmed);
    });

    // 窗口关闭时返回 false
    dialogWindow.on('closed', () => {
      resolve(false);
    });
  });
});

// 显示提示对话框（用于替换 alert）
ipcMain.handle('show-alert-dialog', async (_, message: string, title: string = '提示') => {
  return new Promise<void>((resolve) => {
    // 根据消息长度动态调整窗口大小
    const lines = message.split('\n').length;
    const estimatedHeight = Math.max(180, Math.min(400, 140 + lines * 30));
    const estimatedWidth = Math.max(380, Math.min(600, 320 + Math.max(0, message.length - 50) * 8));
    
    const dialogWindow = new BrowserWindow({
      width: estimatedWidth,
      height: estimatedHeight,
      show: false,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', Arial, sans-serif;
          }
          body {
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: #ffffff;
            padding: 28px 32px;
            border-radius: 0;
            border: 1px solid #e0e0e0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .message {
            font-size: 15px;
            color: #555;
            text-align: center;
            line-height: 1.8;
            white-space: pre-line;
            margin-bottom: 24px;
          }
          .buttons {
            display: flex;
            gap: 10px;
            width: 100%;
            justify-content: flex-end;
            margin-top: 8px;
          }
          button {
            padding: 10px 24px;
            border: none;
            border-radius: 0;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            outline: none;
            min-width: 80px;
          }
          button:focus {
            outline: 2px solid #667eea;
            outline-offset: 2px;
          }
          .ok-btn {
            background: #667eea;
            color: white;
          }
          .ok-btn:hover {
            background: #5568d3;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          .ok-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 6px rgba(102, 126, 234, 0.2);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="message">${message}</div>
            <div class="buttons">
              <button class="ok-btn" onclick="closeDialog()">确定</button>
            </div>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          
          function closeDialog() {
            ipcRenderer.send('alert-dialog-close');
            window.close();
          }
          
          // 窗口加载完成后自动聚焦确定按钮
          window.addEventListener('DOMContentLoaded', () => {
            const okBtn = document.querySelector('.ok-btn');
            if (okBtn) {
              setTimeout(() => {
                okBtn.focus();
              }, 100);
            }
          });
          
          // 支持键盘快捷键
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              closeDialog();
            }
          });
        </script>
      </body>
      </html>
    `)}`);

    // 等待窗口加载完成后显示
    dialogWindow.webContents.once('did-finish-load', () => {
      dialogWindow.show();
      dialogWindow.focus();
      dialogWindow.webContents.focus();
    });

    // 监听窗口关闭
    ipcMain.once('alert-dialog-close', () => {
      dialogWindow.close();
      resolve();
    });

    // 窗口关闭时resolve
    dialogWindow.on('closed', () => {
      resolve();
    });
  });
});

ipcMain.handle('clear-cloud-config', async () => {
  try {
    // 断开数据库连接
    if (cloudDb) {
      cloudDb.disconnect();
      cloudDb = null;
    }
    
    // 删除配置文件
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    
    // 删除密码文件
    const passwordPath = getPasswordPath();
    if (fs.existsSync(passwordPath)) {
      fs.unlinkSync(passwordPath);
    }
    
    // 如果当前模式是云端模式，切换到本地模式
    const appConfigPath = path.join(app.getPath('userData'), 'app-config.json');
    if (fs.existsSync(appConfigPath)) {
      try {
        const configData = fs.readFileSync(appConfigPath, 'utf-8');
        const config = JSON.parse(configData);
        if (config.mode === 'cloud') {
          config.mode = 'local';
          config.selectedCategory = '全部'; // 重置分组选择
          fs.writeFileSync(appConfigPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      } catch (error) {
        console.error('更新应用配置失败:', error);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('清除云端配置失败:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '清除配置失败' 
    };
  }
});

// IPC 处理程序 - 笔记操作（支持本地和云端）
ipcMain.handle('get-notes', async (_, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        const config = getFullConfig();
        if (config) {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(config);
        } else {
          throw new Error('未配置云端数据库');
        }
      } else {
        // 即使 cloudDb 存在，也尝试确保连接有效（快速检查）
        try {
          const config = getFullConfig();
          if (config) {
            await cloudDb.connect(config); // connect 方法会检查现有连接是否有效
          }
        } catch (error) {
          // 如果连接失败，尝试重新连接
          console.log('连接检查失败，尝试重新连接...');
          const config = getFullConfig();
          if (config) {
            cloudDb = new CloudDatabase();
            await cloudDb.connect(config);
          }
        }
      }
      return await cloudDb.getAllNotes();
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return [];
      }
      return db.getAllNotes();
    }
  } catch (error) {
    console.error('获取笔记列表失败:', error);
    return [];
  }
});

ipcMain.handle('get-note', async (_, id: number, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        // 尝试连接云端数据库
        const config = getFullConfig();
        if (config) {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(config);
        } else {
          throw new Error('云端数据库未连接且未配置');
        }
      }
      return await cloudDb.getNote(id);
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return null;
      }
      return db.getNote(id);
    }
  } catch (error) {
    console.error('获取笔记失败:', error);
    return null;
  }
});

ipcMain.handle('create-note', async (_, title: string, mode: 'local' | 'cloud' = 'local', category?: string) => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        throw new Error('云端数据库未连接');
      }
      // 云端模式暂时不支持 category 参数（保持原有行为，不影响云端模式）
      return await cloudDb.createNote(title);
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return null;
      }
      console.log('创建笔记:', title, '分组:', category);
      const note = db.createNote(title, category);
      console.log('笔记创建成功:', note);
      return note;
    }
  } catch (error) {
    console.error('创建笔记失败:', error);
    return null;
  }
});

ipcMain.handle('update-note', async (_, id: number, title: string, content: string, mode: 'local' | 'cloud' = 'local', category?: string) => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        // 尝试连接云端数据库
        const config = getFullConfig();
        if (config) {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(config);
        } else {
          throw new Error('云端数据库未连接且未配置');
        }
      }
      console.log(`云端更新笔记 ${id}，内容长度: ${content.length} 字符`);
      const result = await cloudDb.updateNote(id, title, content, category);
      console.log(`云端更新笔记 ${id} 结果: ${result}`);
      return result;
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return false;
      }
      return db.updateNote(id, title, content, category);
    }
  } catch (error) {
    console.error('更新笔记失败:', error);
    return false;
  }
});

ipcMain.handle('update-note-category', async (_, id: number, category: string, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        throw new Error('云端数据库未连接');
      }
      return await cloudDb.updateNoteCategory(id, category);
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return false;
      }
      return db.updateNoteCategory(id, category);
    }
  } catch (error) {
    console.error('更新笔记分组失败:', error);
    return false;
  }
});

ipcMain.handle('delete-note', async (_, id: number, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        throw new Error('云端数据库未连接');
      }
      return await cloudDb.deleteNote(id);
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return false;
      }
      return db.deleteNote(id);
    }
  } catch (error) {
    console.error('删除笔记失败:', error);
    return false;
  }
});

ipcMain.handle('save-image', async (_, imageData: string, noteId: number, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        // 尝试连接云端数据库
        const config = getFullConfig();
        if (config) {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(config);
        } else {
          throw new Error('云端数据库未连接且未配置');
        }
      }
      const imageId = await cloudDb.saveImage(imageData, noteId);
      console.log('云端图片保存成功，ID:', imageId);
      return imageId;
    } else {
      if (!db) {
        throw new Error('本地数据库未初始化');
      }
      const imageId = db.saveImage(imageData, noteId);
      console.log('本地图片保存成功，ID:', imageId);
      return imageId;
    }
  } catch (error) {
    console.error('保存图片失败:', error);
    throw error; // 抛出错误，让前端能够捕获并提示用户
  }
});

ipcMain.handle('get-image', async (_, imageId: number, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        throw new Error('云端数据库未连接');
      }
      return await cloudDb.getImage(imageId);
    } else {
      if (!db) return null;
      return db.getImage(imageId);
    }
  } catch (error) {
    console.error('获取图片失败:', error);
    return null;
  }
});

// 切换笔记置顶状态
ipcMain.handle('toggle-pin-note', async (_, id: number, mode: 'local' | 'cloud' = 'local') => {
  try {
    if (mode === 'cloud') {
      if (!cloudDb) {
        throw new Error('云端数据库未连接');
      }
      return await cloudDb.togglePinNote(id);
    } else {
      if (!db) {
        console.error('数据库未初始化');
        return false;
      }
      return db.togglePinNote(id);
    }
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    return false;
  }
});

// 保存和获取应用配置（模式和选中的分组）
ipcMain.handle('save-mode', async (_, mode: 'local' | 'cloud', selectedCategory?: string) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'app-config.json');
    let config: any = {};
    
    // 如果配置文件已存在，先读取现有配置
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(data);
      } catch (e) {
        // 如果读取失败，使用空配置
        config = {};
      }
    }
    
    // 更新配置
    config.mode = mode;
    if (selectedCategory !== undefined) {
      config.selectedCategory = selectedCategory;
    }
    // 保留签名配置（如果存在）
    if (!config.signature) {
      config.signature = 'MyNote2';
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('保存配置失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 保存个性签名
ipcMain.handle('save-signature', async (_, signature: string) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'app-config.json');
    let config: any = {};
    
    // 如果配置文件已存在，先读取现有配置
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(data);
      } catch (e) {
        // 如果读取失败，使用空配置
        config = {};
      }
    }
    
    // 更新签名
    config.signature = signature || 'MyNote2';
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('保存签名失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-mode', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'app-config.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      return {
        mode: config.mode || 'local',
        selectedCategory: config.selectedCategory || '全部',
        signature: config.signature || 'MyNote2'
      };
    }
    return {
      mode: 'local',
      selectedCategory: '全部',
      signature: 'MyNote2'
    };
  } catch (error) {
    console.error('获取配置失败:', error);
    return {
      mode: 'local',
      selectedCategory: '全部',
      signature: 'MyNote2'
    };
  }
});

// 保存选中的分组
ipcMain.handle('save-selected-category', async (_, selectedCategory: string) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'app-config.json');
    let config: any = {};
    
    // 如果配置文件已存在，先读取现有配置
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(data);
      } catch (e) {
        // 如果读取失败，使用空配置
        config = {};
      }
    }
    
    // 更新选中的分组
    config.selectedCategory = selectedCategory;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('保存选中分组失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 导出所有笔记为 Markdown（包含图片）
ipcMain.handle('export-notes', async (_, mode: 'local' | 'cloud' = 'local') => {
  try {
    let notes: Note[] = [];
    
    if (mode === 'cloud') {
      if (!cloudDb) {
        const config = getFullConfig();
        if (config) {
          cloudDb = new CloudDatabase();
          await cloudDb.connect(config);
        } else {
          throw new Error('未配置云端数据库');
        }
      }
      notes = await cloudDb.getAllNotes();
    } else {
      if (!db) {
        throw new Error('数据库未初始化');
      }
      notes = db.getAllNotes();
    }

    if (notes.length === 0) {
      return { success: false, error: '没有笔记可导出' };
    }

    // 让用户选择保存文件夹的位置
    const folderResult = await dialog.showOpenDialog(mainWindow!, {
      title: '选择导出文件夹位置',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择此文件夹'
    });

    if (folderResult.canceled || !folderResult.filePaths || folderResult.filePaths.length === 0) {
      return { success: false, error: '用户取消导出' };
    }

    const exportFolderPath = folderResult.filePaths[0];
    const folderName = `MyNote2_导出_${new Date().toISOString().slice(0, 10).replace(/:/g, '-')}`;
    const exportPath = path.join(exportFolderPath, folderName);
    
    // 创建导出文件夹
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }
    
    // 创建 images 文件夹
    const imagesPath = path.join(exportPath, 'images');
    if (!fs.existsSync(imagesPath)) {
      fs.mkdirSync(imagesPath, { recursive: true });
    }
    
    // Markdown 文件路径
    const mdFilePath = path.join(exportPath, 'notes.md');

    // 图片计数器，用于生成唯一文件名
    let imageCounter = 0;
    const imageMap = new Map<string, string>(); // 存储 base64 -> 文件名的映射
    const imageDimensionsMap = new Map<string, { width: number; height: number }>(); // 存储 base64 -> 原始尺寸的映射
    
    // 从 base64 图片数据中获取原始尺寸（使用 Node.js 内置方法）
    const getImageDimensions = (base64Data: string): { width: number; height: number } | null => {
      try {
        const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return null;
        }
        
        const base64Content = matches[2];
        const buffer = Buffer.from(base64Content, 'base64');
        
        // 简单的 PNG/JPEG 尺寸解析
        // PNG: 前8字节是签名，接下来8字节是IHDR，包含宽高（各4字节，大端序）
        // JPEG: 更复杂，需要查找 SOF 标记
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          // PNG 格式
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
          // JPEG 格式 - 查找 SOF 标记 (0xFF 0xC0-0xC3)
          for (let i = 2; i < buffer.length - 8; i++) {
            if (buffer[i] === 0xFF && buffer[i + 1] >= 0xC0 && buffer[i + 1] <= 0xC3) {
              const height = buffer.readUInt16BE(i + 5);
              const width = buffer.readUInt16BE(i + 7);
              return { width, height };
            }
          }
        }
        return null;
      } catch (error) {
        console.error('获取图片尺寸失败:', error);
        return null;
      }
    };
    
    // 将 base64 图片保存为文件并返回相对路径
    const saveImageToFile = (base64Data: string): string => {
      // 检查是否已经保存过这个图片（去重）
      if (imageMap.has(base64Data)) {
        return imageMap.get(base64Data)!;
      }
      
      try {
        // 解析 base64 数据
        const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          console.warn('无效的 base64 图片数据');
          return '';
        }
        
        const imageType = matches[1]; // jpeg, png, gif 等
        const base64Content = matches[2];
        
        // 确定文件扩展名
        const ext = imageType === 'jpeg' ? 'jpg' : imageType;
        
        // 生成文件名
        imageCounter++;
        const fileName = `image_${imageCounter}.${ext}`;
        const filePath = path.join(imagesPath, fileName);
        
        // 将 base64 转换为 Buffer 并保存
        const buffer = Buffer.from(base64Content, 'base64');
        fs.writeFileSync(filePath, buffer);
        
        // 获取并保存原始尺寸
        const dimensions = getImageDimensions(base64Data);
        if (dimensions) {
          imageDimensionsMap.set(base64Data, dimensions);
        }
        
        // 保存映射关系
        const relativePath = `images/${fileName}`;
        imageMap.set(base64Data, relativePath);
        
        return relativePath;
      } catch (error) {
        console.error('保存图片失败:', error);
        return '';
      }
    };
    
    // 将 HTML 转换为 Markdown 的辅助函数
    const htmlToMarkdown = (html: string): string => {
      if (!html) return '';
      
      let markdown = html;
      
      // 处理图片：将 <img src="data:image/..."> 转换为 Markdown 格式 ![图片](images/image_1.jpg)
      // 注意：需要先处理图片，因为后续会移除所有 HTML 标签
      markdown = markdown.replace(/<img([^>]*?)\/?>/gi, (match, attrs) => {
        // 提取 src 属性（支持单引号、双引号或无引号）
        let srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch) {
          srcMatch = attrs.match(/src\s*=\s*([^\s>]+)/i);
        }
        if (srcMatch && srcMatch[1]) {
          const src = srcMatch[1];
          
          // 如果是 base64 格式，保存为文件
          let imagePath = src;
          if (src.startsWith('data:image/')) {
            imagePath = saveImageToFile(src);
            if (!imagePath) {
              return ''; // 保存失败，移除图片
            }
          }
          
          // 提取 alt 属性（如果有）
          let altMatch = attrs.match(/alt\s*=\s*["']([^"']*)["']/i);
          if (!altMatch) {
            altMatch = attrs.match(/alt\s*=\s*([^\s>]+)/i);
          }
          const alt = altMatch ? altMatch[1] : '图片';
          
          // 提取 style 属性中的 width 和 height（如果有）
          const styleMatch = attrs.match(/style\s*=\s*["']([^"']+)["']/i);
          let widthValue = '';
          let heightValue = '';
          if (styleMatch) {
            const widthMatch = styleMatch[1].match(/width\s*:\s*([^;]+)/i);
            const heightMatch = styleMatch[1].match(/height\s*:\s*([^;]+)/i);
            if (widthMatch) {
              widthValue = widthMatch[1].trim();
            }
            if (heightMatch) {
              heightValue = heightMatch[1].trim();
            }
          }
          
          // 计算保持宽高比的尺寸
          let finalWidthAttr = '';
          let finalHeightAttr = '';
          
          if (widthValue || heightValue) {
            // 如果设置了尺寸，保持宽高比
            // 关键：当使用百分比时，不设置另一个维度，让浏览器自动计算以保持比例
            
            // 检查是否包含百分比
            const hasPercentageWidth = widthValue && widthValue.includes('%');
            const hasPercentageHeight = heightValue && heightValue.includes('%');
            
            if (hasPercentageWidth || hasPercentageHeight) {
              // 如果包含百分比，只设置百分比维度，不设置另一个维度，让浏览器自动计算
              if (hasPercentageWidth) {
                finalWidthAttr = ` width="${widthValue}"`;
                // 不设置 height，让浏览器根据原始比例自动计算
              }
              if (hasPercentageHeight && !hasPercentageWidth) {
                // 只有当 width 不是百分比时，才设置 height 百分比
                finalHeightAttr = ` height="${heightValue}"`;
                // 不设置 width，让浏览器根据原始比例自动计算
              }
            } else if (widthValue && heightValue) {
              // 两个都是像素值，检查是否需要调整以保持比例
              const originalDimensions = imageDimensionsMap.get(src);
              if (originalDimensions) {
                const originalWidth = originalDimensions.width;
                const originalHeight = originalDimensions.height;
                const aspectRatio = originalWidth / originalHeight;
                
                const widthNum = parseFloat(widthValue);
                const heightNum = parseFloat(heightValue);
                
                if (!isNaN(widthNum) && !isNaN(heightNum)) {
                  // 检查比例是否匹配
                  const currentRatio = widthNum / heightNum;
                  if (Math.abs(currentRatio - aspectRatio) > 0.01) {
                    // 比例不匹配，根据 width 重新计算 height
                    const newHeight = Math.round(widthNum / aspectRatio);
                    finalWidthAttr = ` width="${widthValue}"`;
                    finalHeightAttr = ` height="${newHeight}px"`;
                  } else {
                    // 比例匹配，直接使用
                    finalWidthAttr = ` width="${widthValue}"`;
                    finalHeightAttr = ` height="${heightValue}"`;
                  }
                } else {
                  // 无法解析，只设置 width，让浏览器自动计算 height
                  finalWidthAttr = ` width="${widthValue}"`;
                }
              } else {
                // 没有原始尺寸，只设置 width，让浏览器自动计算 height
                finalWidthAttr = ` width="${widthValue}"`;
              }
            } else if (widthValue) {
              // 只设置了 width（像素值）
              finalWidthAttr = ` width="${widthValue}"`;
              // 不设置 height，让浏览器根据原始比例自动计算
            } else if (heightValue) {
              // 只设置了 height（像素值）
              finalHeightAttr = ` height="${heightValue}"`;
              // 不设置 width，让浏览器根据原始比例自动计算
            }
          }
          
          // 如果有尺寸信息，使用 HTML 标签以保留尺寸；否则使用标准 Markdown 语法
          if (finalWidthAttr || finalHeightAttr) {
            return `<img src="${imagePath}" alt="${alt}"${finalWidthAttr}${finalHeightAttr} />`;
          } else {
            return `![${alt}](${imagePath})`;
          }
        }
        // 如果没有 src，返回空字符串（移除无效的图片标签）
        return '';
      });
      
      // 处理标题
      markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
      markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
      markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
      
      // 处理粗体
      markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      
      // 处理斜体
      markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
      
      // 处理下划线
      markdown = markdown.replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>');
      
      // 处理代码
      markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
      markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```');
      
      // 处理链接
      markdown = markdown.replace(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
      
      // 处理列表
      markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
      markdown = markdown.replace(/<\/ul>/gi, '\n');
      markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
      markdown = markdown.replace(/<\/ol>/gi, '\n');
      markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      
      // 处理段落
      markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      markdown = markdown.replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n');
      
      // 处理换行
      markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
      
      // 移除剩余的 HTML 标签（但保留 <img> 标签，因为我们已经转换了它们）
      // 使用负向前瞻排除以 img 开头的标签
      markdown = markdown.replace(/<(?!img\b)[^>]+>/gi, '');
      
      // 处理 HTML 实体
      markdown = markdown.replace(/&nbsp;/g, ' ');
      markdown = markdown.replace(/&lt;/g, '<');
      markdown = markdown.replace(/&gt;/g, '>');
      markdown = markdown.replace(/&amp;/g, '&');
      markdown = markdown.replace(/&quot;/g, '"');
      markdown = markdown.replace(/&#39;/g, "'");
      markdown = markdown.replace(/&apos;/g, "'");
      
      // 清理多余的空行（最多保留两个连续换行）
      markdown = markdown.replace(/\n{3,}/g, '\n\n');
      
      return markdown.trim();
    };

    // 生成 Markdown 内容
    let markdown = `# MyNote2 笔记导出\n\n`;
    markdown += `**导出时间**: ${new Date().toLocaleString('zh-CN')}\n`;
    markdown += `**笔记总数**: ${notes.length} 条\n`;
    markdown += `**导出模式**: ${mode === 'local' ? '本地模式' : '云端模式'}\n\n`;
    markdown += `---\n\n`;

    notes.forEach((note, index) => {
      // 笔记标题
      markdown += `## ${index + 1}. ${note.title || '无标题'}\n\n`;
      
      // 笔记元信息
      if (note.category) {
        markdown += `**分组**: ${note.category}\n\n`;
      }
      markdown += `**创建时间**: ${new Date(note.createdAt).toLocaleString('zh-CN')}\n\n`;
      markdown += `**更新时间**: ${new Date(note.updatedAt).toLocaleString('zh-CN')}\n\n`;
      
      // 笔记内容（转换为 Markdown）
      if (note.content) {
        markdown += `### 内容\n\n`;
        const markdownContent = htmlToMarkdown(note.content);
        markdown += markdownContent;
        markdown += `\n\n`;
      }
      
      markdown += `---\n\n`;
    });

    // 保存 Markdown 文件
    fs.writeFileSync(mdFilePath, markdown, 'utf-8');

    return { success: true, filePath: exportPath };
  } catch (error) {
    console.error('导出笔记失败:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

