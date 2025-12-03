-- 我的笔记 - MySQL 建表脚本
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
DESCRIBE images;

