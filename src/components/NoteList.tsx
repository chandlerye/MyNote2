import React, { memo, useRef, useEffect } from 'react';
import { Note } from '../App';
import { setUserInteractingWithInput } from '../utils/editorStateManager';
import CategorySelector from './CategorySelector';
import './NoteList.css';

interface NoteListProps {
  notes: Note[];
  selectedNoteId?: number;
  onSelectNote: (id: number) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: number) => void;
  onTogglePin?: (id: number) => void;
  mode?: 'local' | 'cloud';
  loading: boolean;
  selectedCategory: string;
  categories: string[];
  onCategoryChange: (category: string) => void;
  searchKeyword: string;
  onSearchChange: (keyword: string) => void;
}

const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
  mode = 'local',
  loading,
  selectedCategory,
  categories,
  onCategoryChange,
  searchKeyword,
  onSearchChange,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 确保搜索框可编辑，但不强制聚焦（让用户点击哪里，焦点就在哪里）
  useEffect(() => {
    const searchInput = searchInputRef.current;
    if (!searchInput) return;

    // 只在组件挂载时确保搜索框可编辑，不再定期检查（避免干扰输入）
    searchInput.disabled = false;
    searchInput.readOnly = false;
    searchInput.removeAttribute('disabled');
    searchInput.removeAttribute('readonly');
  }, []);

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('确定要删除这条笔记吗？')) {
      onDeleteNote(id);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (onTogglePin) {
      onTogglePin(id);
    }
  };

  return (
    <div className="note-list">
      <div className="note-list-header">
        <button className="create-note-btn" onClick={onCreateNote}>
          + 新建笔记
        </button>
        <div style={{ marginTop: '8px' }}>
          <CategorySelector
            selectedCategory={selectedCategory}
            categories={categories}
            onCategoryChange={onCategoryChange}
          />
        </div>
        <div style={{ marginTop: '8px' }}>
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="搜索笔记..."
            value={searchKeyword}
            onChange={(e) => {
              // 只阻止事件冒泡，不阻止 React 的合成事件处理
              e.stopPropagation();
              // 立即更新状态，确保输入响应及时
              onSearchChange(e.target.value);
            }}
            onFocus={(e) => {
              e.stopPropagation();
              // 设置全局标志：用户正在使用搜索框
              setUserInteractingWithInput(true);
            }}
            onBlur={(e) => {
              e.stopPropagation();
              // 延迟清除全局标志：用户不再使用搜索框
              setTimeout(() => {
                setUserInteractingWithInput(false);
              }, 100);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              // 允许正常的键盘事件处理（如退格、删除等）
              e.stopPropagation();
            }}
            onKeyPress={(e) => {
              e.stopPropagation();
            }}
            onKeyUp={(e) => {
              e.stopPropagation();
            }}
            onInput={(e) => {
              // 确保输入事件正常处理
              e.stopPropagation();
            }}
            tabIndex={0}
          />
        </div>
      </div>
      <div className="note-list-content">
        {loading ? (
          <div className="loading">
            <span className="loading-text">加载中</span>
            <span className="loading-dots">
              <span className="dot dot1">.</span>
              <span className="dot dot2">.</span>
              <span className="dot dot3">.</span>
            </span>
          </div>
        ) : notes.length === 0 ? (
          <div className="empty-state">暂无笔记，点击上方按钮创建</div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`note-item ${selectedNoteId === note.id ? 'active' : ''} ${note.isPinned ? 'pinned' : ''}`}
              onClick={() => onSelectNote(note.id)}
            >
              <div className="note-item-header">
                <div className="note-title-wrapper">
                  {note.isPinned ? <span className="pin-icon">📌</span> : null}
                  <h3 className="note-title">
                    {(() => {
                      // 确保 title 是字符串
                      let title = String(note.title || '无标题');
                      // 调试：输出原始标题和 isPinned 值
                      if (title.startsWith('0')) {
                        console.log('标题以0开头:', { 
                          id: note.id, 
                          title: note.title, 
                          isPinned: note.isPinned,
                          titleType: typeof note.title 
                        });
                      }
                      // 如果标题以"0"开头且后面不是纯数字，去除开头的"0"
                      // 这样可以去除"0新笔记"中的"0"，但保留"01"、"02"这样的编号
                      if (title.startsWith('0') && title.length > 1) {
                        // 检查是否是纯数字（如"01"、"02"）
                        const isPureNumber = /^0\d+$/.test(title);
                        if (!isPureNumber) {
                          // 不是纯数字，去除开头的"0"
                          title = title.substring(1);
                        }
                      }
                      return title || '无标题';
                    })()}
                  </h3>
                </div>
                <div className="note-actions">
                  {onTogglePin && (
                    <button
                      className="pin-btn"
                      onClick={(e) => handleTogglePin(e, note.id)}
                      title={note.isPinned ? '取消置顶' : '置顶'}
                    >
                      {note.isPinned ? '📌' : '📌'}
                    </button>
                  )}
                  <button
                    className="delete-btn"
                    onClick={(e) => handleDelete(e, note.id)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="note-preview">
                {note.content.replace(/<[^>]*>/g, '').substring(0, 50)}
                {note.content.length > 50 ? '...' : ''}
              </div>
              <div className="note-time">
                {new Date(note.updatedAt).toLocaleString('zh-CN')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 使用 memo 优化，避免不必要的重新渲染
export default memo(NoteList);

