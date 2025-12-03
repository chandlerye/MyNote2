import mysql from 'mysql2/promise';
import { Note } from './database';

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class CloudDatabase {
  private pool: mysql.Pool | null = null;
  private config: MySQLConfig | null = null;
  private isReconnecting: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 60 * 1000; // 1分钟心跳间隔（更频繁，确保连接活跃）

  async connect(config: MySQLConfig): Promise<void> {
    // 如果已经连接且配置相同，直接返回
    if (this.pool && this.config && 
        this.config.host === config.host &&
        this.config.port === config.port &&
        this.config.database === config.database &&
        this.config.user === config.user) {
      // 测试连接是否仍然有效
      try {
        const connection = await this.pool.getConnection();
        connection.release();
        console.log('MySQL 连接池已存在且有效');
        return;
      } catch (error) {
        console.log('现有连接池无效，重新创建...');
        // 连接池无效，需要重新创建
        if (this.pool) {
          try {
            await this.pool.end();
          } catch (e) {
            // 忽略关闭错误
          }
          this.pool = null;
        }
      }
    }

    this.config = config;
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      charset: 'utf8mb4',
      connectTimeout: 10000, // 10秒连接超时
      // 启用自动重连
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    // 测试连接
    try {
      const connection = await this.pool.getConnection();
      connection.release();
      console.log('MySQL 连接成功');
      
      // 启动心跳检测
      this.startHeartbeat();
    } catch (error) {
      console.error('MySQL 连接失败:', error);
      if (this.pool) {
        try {
          await this.pool.end();
        } catch (e) {
          // 忽略关闭错误
        }
        this.pool = null;
      }
      throw error;
    }
  }

  disconnect(): void {
    // 停止心跳检测
    this.stopHeartbeat();
    
    if (this.pool) {
      this.pool.end();
      this.pool = null;
    }
    this.config = null;
  }

  // 启动心跳检测
  private startHeartbeat(): void {
    // 如果已经有心跳检测在运行，先停止
    this.stopHeartbeat();
    
    console.log(`启动心跳检测，间隔: ${this.HEARTBEAT_INTERVAL / 1000}秒`);
    
    this.heartbeatInterval = setInterval(async () => {
      await this.performHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  // 停止心跳检测
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('心跳检测已停止');
    }
  }

  // 执行心跳检测
  private async performHeartbeat(): Promise<void> {
    if (!this.pool || !this.config) {
      console.log('心跳检测：连接池或配置不存在，停止心跳');
      this.stopHeartbeat();
      return;
    }

    try {
      // 执行简单的查询来保持连接活跃
      const connection = await Promise.race([
        this.pool.getConnection(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('心跳检测超时')), 5000)
        )
      ]);
      
      // 执行 SELECT 1 查询
      await connection.query('SELECT 1');
      connection.release();
      
      console.log('心跳检测成功');
    } catch (error) {
      console.log('心跳检测失败，尝试重新连接:', error);
      
      // 心跳失败，尝试重新连接
      if (!this.isReconnecting && this.config) {
        this.isReconnecting = true;
        try {
          // 关闭旧连接池
          if (this.pool) {
            try {
              await this.pool.end();
            } catch (e) {
              // 忽略关闭错误
            }
            this.pool = null;
          }

          // 重新连接
          await this.connect(this.config);
          console.log('心跳检测触发自动重连成功');
        } catch (reconnectError) {
          console.error('心跳检测触发自动重连失败:', reconnectError);
          // 重连失败，停止心跳检测
          this.stopHeartbeat();
        } finally {
          this.isReconnecting = false;
        }
      }
    }
  }

  // 检查并确保连接有效，如果无效则自动重连（使用 SELECT 1 查询，更可靠）
  private async ensureConnectionValid(): Promise<mysql.Pool> {
    if (!this.pool || !this.config) {
      throw new Error('MySQL 未连接，请先配置数据库连接');
    }

    // 使用 SELECT 1 查询检查连接是否有效（比 getConnection 更可靠）
    try {
      const connection = await Promise.race([
        this.pool.getConnection(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('获取连接超时')), 2000)
        )
      ]);
      
      // 执行 SELECT 1 查询，确保连接真正可用
      await Promise.race([
        connection.query('SELECT 1'),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('查询超时')), 3000)
        )
      ]);
      
      connection.release();
      return this.pool;
    } catch (error) {
      console.log('连接已断开，尝试重新连接...', error);
      
      // 防止并发重连
      if (this.isReconnecting) {
        // 等待重连完成
        let retries = 0;
        while (this.isReconnecting && retries < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
        if (this.pool && this.config) {
          return this.pool;
        }
      }

      this.isReconnecting = true;
      try {
        // 停止心跳检测
        this.stopHeartbeat();
        
        // 关闭旧连接池
        if (this.pool) {
          try {
            await this.pool.end();
          } catch (e) {
            // 忽略关闭错误
          }
          this.pool = null;
        }

        // 重新连接
        if (this.config) {
          await this.connect(this.config);
          console.log('自动重连成功');
        }
      } catch (reconnectError) {
        console.error('自动重连失败:', reconnectError);
        throw new Error('数据库连接已断开，无法自动重连');
      } finally {
        this.isReconnecting = false;
      }

      if (!this.pool) {
        throw new Error('MySQL 未连接，请先配置数据库连接');
      }
      return this.pool;
    }
  }

  // 执行查询，带重试机制
  private async executeQueryWithRetry<T>(
    queryFn: (pool: mysql.Pool) => Promise<T>,
    retries: number = 1
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const pool = await this.ensureConnectionValid();
        return await queryFn(pool);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`查询失败，重试 ${i + 1}/${retries + 1}:`, lastError.message);
        
        // 如果是连接错误，强制重新连接
        if (lastError.message.includes('连接') || 
            lastError.message.includes('timeout') ||
            lastError.message.includes('ECONNRESET') ||
            lastError.message.includes('PROTOCOL_CONNECTION_LOST')) {
          // 重置连接池，强制重新连接
          if (this.pool) {
            try {
              this.stopHeartbeat();
              await this.pool.end();
            } catch (e) {
              // 忽略关闭错误
            }
            this.pool = null;
          }
          
          // 如果不是最后一次重试，等待一下再重试
          if (i < retries && this.config) {
            await new Promise(resolve => setTimeout(resolve, 500));
            // 重新连接
            try {
              await this.connect(this.config);
            } catch (e) {
              // 连接失败，继续下一次重试
            }
          }
        } else {
          // 非连接错误，直接抛出
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('查询失败');
  }

  private ensureConnected(): mysql.Pool {
    if (!this.pool) {
      throw new Error('MySQL 未连接，请先配置数据库连接');
    }
    return this.pool;
  }

  async getAllNotes(): Promise<Note[]> {
    return await this.executeQueryWithRetry(async (pool) => {
      const [rows] = await pool.query(
        'SELECT id, title, content, createdAt, updatedAt, COALESCE(isPinned, 0) as isPinned, COALESCE(category, "") as category FROM notes ORDER BY isPinned DESC, updatedAt DESC'
      ) as [any[], any];

      return rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content || '',
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        isPinned: row.isPinned || 0,
        category: row.category || '',
      }));
    });
  }

  async getNote(id: number): Promise<Note | null> {
    return await this.executeQueryWithRetry(async (pool) => {
      const [rows] = await pool.query(
        'SELECT id, title, content, createdAt, updatedAt, COALESCE(isPinned, 0) as isPinned, COALESCE(category, "") as category FROM notes WHERE id = ?',
        [id]
      ) as [any[], any];

      if (rows.length === 0) {
        console.log(`云端获取笔记 ${id}：未找到`);
        return null;
      }

      const row = rows[0];
      const content = row.content || '';
      const contentLength = content.length;
      const hasImages = content.includes('<img');
      console.log(`云端获取笔记 ${id}，标题: ${row.title}，内容长度: ${contentLength}，是否包含图片: ${hasImages}`);
      
      return {
        id: row.id,
        title: row.title,
        content: content,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        isPinned: row.isPinned || 0,
        category: row.category || '',
      };
    });
  }

  async createNote(title: string): Promise<Note> {
    const insertId = await this.executeQueryWithRetry(async (pool) => {
      const now = new Date();
      const [result] = await pool.query(
        'INSERT INTO notes (title, content, createdAt, updatedAt, isPinned) VALUES (?, ?, ?, ?, 0)',
        [title, '', now, now]
      ) as [mysql.ResultSetHeader, any];
      return result.insertId;
    });

    const note = await this.getNote(insertId);
    if (!note) {
      throw new Error('创建笔记后无法获取笔记数据');
    }
    return note;
  }

  async updateNote(id: number, title: string, content: string, category?: string): Promise<boolean> {
    return await this.executeQueryWithRetry(async (pool) => {
      const now = new Date();
      
      // 记录内容长度，用于调试
      const contentLength = content ? content.length : 0;
      console.log(`云端更新笔记 ${id}，标题长度: ${title.length}，内容长度: ${contentLength}，是否包含图片: ${content.includes('<img')}`);
      
      // 如果 category 未传递（undefined），保留原有的 category 值
      // 只有当 category 明确传递时（包括空字符串），才更新 category
      if (category !== undefined) {
        const [result] = await pool.query(
          'UPDATE notes SET title = ?, content = ?, updatedAt = ?, category = ? WHERE id = ?',
          [title, content || '', now, category || null, id]
        ) as [mysql.ResultSetHeader, any];
        const success = result.affectedRows > 0;
        console.log(`云端更新笔记 ${id} 结果: ${success ? '成功' : '失败'}，影响行数: ${result.affectedRows}`);
        return success;
      } else {
        // category 未传递，只更新 title、content 和 updatedAt，保留原有的 category
        const [result] = await pool.query(
          'UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?',
          [title, content || '', now, id]
        ) as [mysql.ResultSetHeader, any];
        const success = result.affectedRows > 0;
        console.log(`云端更新笔记 ${id} 结果: ${success ? '成功' : '失败'}，影响行数: ${result.affectedRows}`);
        return success;
      }
    });
  }
  
  async updateNoteCategory(id: number, category: string): Promise<boolean> {
    return await this.executeQueryWithRetry(async (pool) => {
      const [result] = await pool.query(
        'UPDATE notes SET category = ? WHERE id = ?',
        [category || null, id]
      ) as [mysql.ResultSetHeader, any];
      return result.affectedRows > 0;
    });
  }

  async deleteNote(id: number): Promise<boolean> {
    return await this.executeQueryWithRetry(async (pool) => {
      const [result] = await pool.query(
        'DELETE FROM notes WHERE id = ?',
        [id]
      ) as [mysql.ResultSetHeader, any];
      return result.affectedRows > 0;
    });
  }

  async saveImage(imageData: string, noteId: number): Promise<number> {
    return await this.executeQueryWithRetry(async (pool) => {
      const now = new Date();
      const [result] = await pool.query(
        'INSERT INTO images (noteId, data, createdAt) VALUES (?, ?, ?)',
        [noteId, imageData, now]
      ) as [mysql.ResultSetHeader, any];
      return result.insertId;
    });
  }

  async getImage(imageId: number): Promise<string | null> {
    return await this.executeQueryWithRetry(async (pool) => {
      const [rows] = await pool.query(
        'SELECT data FROM images WHERE id = ?',
        [imageId]
      ) as [any[], any];

      if (rows.length === 0) {
        return null;
      }
      return rows[0].data;
    });
  }

  async togglePinNote(id: number): Promise<boolean> {
    // 先获取当前状态
    const note = await this.getNote(id);
    if (!note) return false;
    
    const newPinStatus = (note.isPinned || 0) === 1 ? 0 : 1;
    return await this.executeQueryWithRetry(async (pool) => {
      const [result] = await pool.execute(
        'UPDATE notes SET isPinned = ? WHERE id = ?',
        [newPinStatus, id]
      ) as [mysql.ResultSetHeader, any];
      return result.affectedRows > 0;
    });
  }
}

