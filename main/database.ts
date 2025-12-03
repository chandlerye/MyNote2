import DatabaseLib from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: number; // 0 = 未置顶, 1 = 置顶
  category?: string; // 分组名称，空字符串或null表示未分组
}

export class Database {
  private db: DatabaseLib.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'notes.db');
    
    console.log('数据库路径:', dbPath);
    
    // 检查是否存在旧路径的数据库（如果应用名称改变了）
    const oldPaths = [
      path.join(app.getPath('appData'), '我的笔记', 'notes.db'),
      path.join(app.getPath('appData'), 'MyNote2', 'notes.db'),
    ];
    
    // 如果新路径不存在数据库，尝试从旧路径迁移
    if (!fs.existsSync(dbPath)) {
      for (const oldPath of oldPaths) {
        if (fs.existsSync(oldPath)) {
          console.log('发现旧数据库，正在迁移:', oldPath);
          // 确保目标目录存在
          if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
          }
          // 复制数据库文件
          fs.copyFileSync(oldPath, dbPath);
          console.log('数据库迁移完成');
          break;
        }
      }
    }
    
    this.db = new DatabaseLib(dbPath);
    this.initTables();
  }

  private initTables() {
    // 创建笔记表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        isPinned INTEGER DEFAULT 0
      )
    `);
    
    // 如果表已存在但没有 isPinned 字段，添加该字段
    try {
      this.db.exec('ALTER TABLE notes ADD COLUMN isPinned INTEGER DEFAULT 0');
    } catch (error) {
      // 字段已存在，忽略错误
    }
    
    // 如果表已存在但没有 category 字段，添加该字段
    try {
      this.db.exec('ALTER TABLE notes ADD COLUMN category TEXT');
    } catch (error) {
      // 字段已存在，忽略错误
    }

    // 创建图片表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        noteId INTEGER NOT NULL,
        data TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);
  }

  getAllNotes(): Note[] {
    // 置顶的笔记在前，按 updatedAt DESC 排序
    // 显式选择所有字段，确保返回的数据结构一致（包括 category）
    const stmt = this.db.prepare(`
      SELECT id, title, content, createdAt, updatedAt, 
             COALESCE(isPinned, 0) as isPinned, 
             COALESCE(category, '') as category 
      FROM notes 
      ORDER BY isPinned DESC, updatedAt DESC
    `);
    return stmt.all() as Note[];
  }

  getNote(id: number): Note | null {
    // 显式选择所有字段，确保返回的数据结构一致（包括 category）
    const stmt = this.db.prepare(`
      SELECT id, title, content, createdAt, updatedAt, 
             COALESCE(isPinned, 0) as isPinned, 
             COALESCE(category, '') as category 
      FROM notes 
      WHERE id = ?
    `);
    const note = stmt.get(id) as Note | undefined;
    return note || null;
  }

  createNote(title: string, category?: string): Note {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(
        'INSERT INTO notes (title, content, createdAt, updatedAt, isPinned, category) VALUES (?, ?, ?, ?, 0, ?)'
      );
      const result = stmt.run(title, '', now, now, category || null);
      
      const lastId = result.lastInsertRowid as number;
      if (!lastId) {
        throw new Error('插入笔记失败：未返回 ID');
      }
      
      const note = this.getNote(lastId);
      if (!note) {
        throw new Error('创建笔记后无法获取笔记数据');
      }
      
      return note;
    } catch (error) {
      console.error('数据库创建笔记错误:', error);
      throw error;
    }
  }

  updateNote(id: number, title: string, content: string, category?: string): boolean {
    const now = new Date().toISOString();
    // 如果 category 未传递（undefined），保留原有的 category 值
    // 只有当 category 明确传递时（包括空字符串），才更新 category
    if (category !== undefined) {
      const stmt = this.db.prepare(
        'UPDATE notes SET title = ?, content = ?, updatedAt = ?, category = ? WHERE id = ?'
      );
      const result = stmt.run(title, content, now, category || null, id);
      return result.changes > 0;
    } else {
      // category 未传递，只更新 title、content 和 updatedAt，保留原有的 category
      const stmt = this.db.prepare(
        'UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?'
      );
      const result = stmt.run(title, content, now, id);
      return result.changes > 0;
    }
  }
  
  updateNoteCategory(id: number, category: string): boolean {
    const stmt = this.db.prepare('UPDATE notes SET category = ? WHERE id = ?');
    const result = stmt.run(category || null, id);
    return result.changes > 0;
  }

  togglePinNote(id: number): boolean {
    // 先获取当前状态
    const note = this.getNote(id);
    if (!note) return false;
    
    const newPinStatus = (note.isPinned || 0) === 1 ? 0 : 1;
    const stmt = this.db.prepare('UPDATE notes SET isPinned = ? WHERE id = ?');
    const result = stmt.run(newPinStatus, id);
    return result.changes > 0;
  }

  deleteNote(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM notes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  saveImage(imageData: string, noteId: number): number | null {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      'INSERT INTO images (noteId, data, createdAt) VALUES (?, ?, ?)'
    );
    const result = stmt.run(noteId, imageData, now);
    return result.lastInsertRowid as number;
  }

  getImage(imageId: number): string | null {
    const stmt = this.db.prepare('SELECT data FROM images WHERE id = ?');
    const row = stmt.get(imageId) as { data: string } | undefined;
    return row?.data || null;
  }

  close() {
    this.db.close();
  }
}

