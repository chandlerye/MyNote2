# 云服务器 MySQL 配置步骤

## 📋 完整步骤

### 步骤 1：使用 root 用户登录 MySQL

```bash
mysql -u root -p
```

输入 root 密码后进入 MySQL。

### 步骤 2：创建数据库

```sql
CREATE DATABASE IF NOT EXISTS mynote2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 步骤 3：创建数据库用户并授权

```sql
CREATE USER IF NOT EXISTS 'your_user'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON mynote2.* TO 'your_user'@'%';
FLUSH PRIVILEGES;
```

**说明**：
- `your_user` 替换为您想要的用户名
- `your_password` 替换为强密码
- `'%'` 表示允许从任何 IP 地址连接，如果只想允许特定 IP，可以替换为具体 IP 地址

### 步骤 4：验证用户权限

```sql
SHOW GRANTS FOR 'your_user'@'%';
```

### 步骤 5：退出 root 用户

```sql
EXIT;
```

### 步骤 6：使用新用户登录并建表

```bash
mysql -u your_user -p mynote2
```

输入新用户的密码。

### 步骤 7：执行建表脚本

在 MySQL 中执行 `云端MySQL建表脚本.sql` 文件中的 SQL 语句，或直接复制执行：

```sql
USE mynote2;

-- 创建笔记表
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
```

### 步骤 8：验证表是否创建成功

```sql
SHOW TABLES;
DESCRIBE notes;
DESCRIBE images;
```

应该看到 `notes` 和 `images` 两个表。

### 步骤 9：退出 MySQL

```sql
EXIT;
```

## ✅ 完成！

现在数据库和表都已创建完成，可以在应用中配置连接了。

## 📝 在应用中配置

1. 创建配置文件：复制 `docs/cloud-config-template.json` 到项目根目录，命名为 `cloud-config.json`
2. 编辑配置文件，填写您的数据库信息（不包含密码）
3. 运行应用，切换到"云端模式"
4. 点击"配置数据库"按钮
5. 选择刚才创建的 `cloud-config.json` 文件
6. 输入数据库用户密码
7. 点击"测试连接"验证连接
8. 点击"保存"完成配置

## 🔍 验证数据

在服务器上查询笔记：

```bash
mysql -u your_user -p mynote2 -e "SELECT id, title, LEFT(content, 50) AS preview, updatedAt FROM notes ORDER BY updatedAt DESC LIMIT 5;"
```

## ⚠️ 注意事项

1. **确保 MySQL 允许远程连接**：
   - 编辑 MySQL 配置文件：`/etc/mysql/mysql.conf.d/mysqld.cnf` 或 `/etc/my.cnf`
   - 找到 `bind-address` 行，改为 `bind-address = 0.0.0.0`
   - 重启 MySQL：`sudo systemctl restart mysql`

2. **确保防火墙开放 3306 端口**：
   ```bash
   sudo ufw allow 3306/tcp
   # 或
   sudo firewall-cmd --permanent --add-port=3306/tcp
   sudo firewall-cmd --reload
   ```

3. **如果连接失败**：
   - 检查用户权限：`SHOW GRANTS FOR 'your_user'@'%';`
   - 检查数据库是否存在：`SHOW DATABASES;`
   - 检查 MySQL 服务是否运行：`sudo systemctl status mysql`
   - 检查端口是否开放：`netstat -tlnp | grep 3306`

4. **安全建议**：
   - 使用强密码
   - 如果可能，限制用户只能从特定 IP 连接（将 `'%'` 改为具体 IP）
   - 定期备份数据库

