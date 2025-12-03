# MyNote2 - 我的笔记

一个支持本地和云端模式的跨平台笔记应用，使用 Electron + React + TypeScript 构建。

## ✨ 功能特性

- ✅ **双模式支持**：本地模式（SQLite）和云端模式（MySQL）
- ✅ **富文本编辑**：支持 Markdown 渲染、代码高亮、图片插入
- ✅ **笔记管理**：创建、编辑、删除、置顶、分组
- ✅ **搜索功能**：按标题和内容搜索笔记
- ✅ **自动保存**：编辑内容自动保存
- ✅ **数据同步**：云端模式支持多设备数据同步
- ✅ **连接保持**：智能心跳检测，自动重连，确保连接稳定

## 🛠️ 技术栈

- **Electron** - 跨平台桌面应用框架
- **React** - UI 框架
- **TypeScript** - 类型安全
- **SQLite (better-sqlite3)** - 本地数据库
- **MySQL (mysql2)** - 云端数据库
- **Vite** - 构建工具
- **Quill** - 富文本编辑器

## 📦 快速开始

### 方式一：直接使用（推荐）

1. 下载并解压 `release/win-unpacked.zip`
2. 进入解压后的文件夹
3. 双击 `MyNote2.exe` 即可运行

**注意**：首次运行会自动创建本地数据库，无需任何配置。

### 方式二：从源码运行

#### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

#### 安装依赖

```bash
npm install
```

#### 开发模式

```bash
npm run dev
```

这将同时启动 React 开发服务器和 Electron 应用。

#### 构建应用

```bash
# 构建所有代码
npm run build:all

# 构建可执行文件（Windows）
npm run build:exe
```

构建后的文件在 `release/win-unpacked/` 文件夹中。

## 📁 项目结构

```
MyNote2/
├── main/                      # Electron 主进程代码
│   ├── main.ts               # 主进程入口，窗口管理、IPC 通信
│   ├── preload.ts            # 预加载脚本，暴露 API 给渲染进程
│   ├── database.ts           # 本地数据库（SQLite）操作
│   └── cloudDatabase.ts      # 云端数据库（MySQL）操作，包含心跳检测
├── src/                       # React 渲染进程代码
│   ├── components/           # React 组件
│   │   ├── SimpleEditor.tsx  # 富文本编辑器组件
│   │   ├── NoteList.tsx      # 笔记列表组件
│   │   ├── CategorySelector.tsx  # 分组选择器
│   │   └── ModeSelector.tsx  # 模式选择器（本地/云端）
│   ├── utils/                # 工具函数
│   │   ├── cursorManager.ts  # 光标位置管理
│   │   └── editorStateManager.ts  # 编辑器状态管理
│   ├── types/                # TypeScript 类型定义
│   │   └── electron.d.ts     # Electron API 类型定义
│   ├── App.tsx               # 主应用组件
│   └── main.tsx              # React 入口
├── docs/                      # 文档和配置文件
│   ├── 云服务器MySQL配置步骤.md  # 云端数据库配置指南
│   ├── 云端MySQL建表脚本.sql     # MySQL 建表脚本
│   └── cloud-config-template.json  # 配置文件模板
├── package.json               # 项目配置
├── package-lock.json         # 依赖锁定文件
├── tsconfig.json              # TypeScript 配置（根配置）
├── tsconfig.main.json         # TypeScript 配置（主进程）
├── tsconfig.node.json         # TypeScript 配置（Node.js）
├── vite.config.ts             # Vite 构建配置
├── index.html                 # HTML 入口文件
├── .gitignore                 # Git 忽略文件配置
└── README.md                  # 项目说明

# 以下文件夹/文件不在仓库中（由 .gitignore 排除）：
# - build/          # 构建资源（应用图标等）
# - dist/           # 编译输出
# - release/        # 打包输出（EXE 文件）
# - node_modules/   # 依赖包
```

## 🚀 使用方法

### 本地模式

1. 启动应用后，默认使用本地模式
2. 点击左侧"新建笔记"按钮创建笔记
3. 在右侧编辑器中编辑笔记内容
4. 内容会自动保存到本地 SQLite 数据库

### 云端模式

#### 1. 准备云服务器 MySQL 数据库

详细步骤请参考：[docs/云服务器MySQL配置步骤.md](docs/云服务器MySQL配置步骤.md)

**快速步骤**：

1. 在云服务器上创建数据库：
   ```sql
   CREATE DATABASE mynote2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. 创建数据库用户并授权：
   ```sql
   CREATE USER 'your_user'@'%' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON mynote2.* TO 'your_user'@'%';
   FLUSH PRIVILEGES;
   ```

3. 执行建表脚本：
   ```bash
   mysql -u your_user -p mynote2 < docs/云端MySQL建表脚本.sql
   ```

4. 确保 MySQL 允许远程连接：
   - 检查 `bind-address` 配置（应为 `0.0.0.0`）
   - 开放防火墙 3306 端口

#### 2. 创建配置文件

复制 `docs/cloud-config-template.json` 到项目根目录，命名为 `cloud-config.json`，并填写您的数据库信息：

```json
{
  "host": "您的服务器IP地址",
  "port": 3306,
  "database": "mynote2",
  "user": "您的数据库用户名"
}
```

**注意**：配置文件中不包含密码，密码将在应用中输入并加密存储。

#### 3. 在应用中配置

1. 启动应用
2. 点击右上角的模式选择器，切换到"云端模式"
3. 点击"配置数据库"按钮
4. 选择刚才创建的 `cloud-config.json` 文件
5. 输入数据库密码
6. 点击"测试连接"验证连接
7. 点击"保存"完成配置
8. 应用会自动重启并连接到云端数据库

#### 4. 使用云端模式

- 所有笔记数据存储在云服务器上
- 可以在多台设备间同步数据
- 支持从休眠恢复后自动重连
- 智能心跳检测，保持连接稳定

## 🔧 开发流程

### 开发环境设置

1. 克隆项目：
   ```bash
   git clone <repository-url>
   cd MyNote2
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发模式：
   ```bash
   npm run dev
   ```

### 代码结构说明

- **主进程（main/）**：负责窗口管理、IPC 通信、数据库操作
- **渲染进程（src/）**：React 应用，负责 UI 展示和用户交互
- **IPC 通信**：通过 `preload.ts` 暴露的 API 进行主进程和渲染进程通信

### 构建流程

1. **编译主进程代码**：
   ```bash
   npm run build:main
   ```
   将 TypeScript 编译为 JavaScript，输出到 `dist/`

2. **构建渲染进程**：
   ```bash
   npm run build:renderer
   ```
   使用 Vite 构建 React 应用，输出到 `dist/renderer/`

3. **打包应用**：
   ```bash
   npm run build:exe
   ```
   使用 electron-builder 打包成可执行文件

## 📝 环境配置

### 开发环境

- Node.js >= 16.0.0
- npm >= 7.0.0
- TypeScript >= 5.0.0

### 生产环境

- Windows 10/11（已测试）
- 无需安装 Node.js（使用打包后的 EXE）

### 云端数据库要求

- MySQL >= 5.7 或 MariaDB >= 10.2
- 支持远程连接
- 字符集：utf8mb4
- 需要创建 notes 和 images 表（见建表脚本）

## 🔐 数据存储

### 本地模式

- 数据库文件位置：`C:\Users\<用户名>\AppData\Roaming\mynote2\notes.db`
- 使用 SQLite 数据库
- 数据完全存储在本地

### 云端模式

- 数据存储在云服务器 MySQL 数据库中
- 密码加密存储（AES-256-CBC）
- 配置文件位置：`C:\Users\<用户名>\AppData\Roaming\mynote2\cloud-config.json`

## 🚨 注意事项

1. **云端模式配置**：
   - 确保云服务器 MySQL 允许远程连接
   - 确保防火墙开放 3306 端口
   - 建议使用强密码

2. **数据备份**：
   - 本地模式：定期备份 `notes.db` 文件
   - 云端模式：定期备份 MySQL 数据库

3. **图片存储**：
   - 图片以 base64 格式存储在数据库中
   - 建议图片大小不超过 10MB

4. **连接稳定性**：
   - 应用会自动进行心跳检测（每1分钟）
   - 连接断开时会自动重连
   - 从休眠恢复后会自动检测并重连

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题或建议，请通过 GitHub Issues 反馈。
