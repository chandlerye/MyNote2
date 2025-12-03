import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NoteList from './components/NoteList';
import SimpleEditor from './components/SimpleEditor';
import ModeSelector from './components/ModeSelector';
import { saveCursorPosition, restoreCursorPosition } from './utils/cursorManager';
import { editorStateManager, shouldSkipFocusManagement } from './utils/editorStateManager';
import './App.css';

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: number;
  category?: string;
}

type Mode = 'local' | 'cloud';

// 全局标志：标记用户是否正在使用搜索框或其他输入框
// 当这个标志为 true 时，所有焦点管理逻辑都应该跳过，不抢夺焦点
let isUserInteractingWithInput = false;

// 设置全局标志的工具函数
export const setUserInteractingWithInput = (value: boolean) => {
  isUserInteractingWithInput = value;
};

// 检查是否应该跳过焦点管理的工具函数
export const shouldSkipFocusManagement = (): boolean => {
  const activeElement = document.activeElement;
  // 检查是否在搜索框或其他输入框中
  const isInSearchInput = activeElement?.classList.contains('search-input') ||
    activeElement?.closest('.search-input') !== null ||
    activeElement?.closest('input.search-input') !== null;

  const isInTitleInput = activeElement?.classList.contains('title-input') ||
    activeElement?.closest('.title-input') !== null;

  const isInCategoryInput = activeElement?.closest('input[list="categories-list"]') !== null;

  return isUserInteractingWithInput || isInSearchInput || isInTitleInput || isInCategoryInput;
};

// 恢复编辑器状态的通用函数（使用新的状态管理器）
const restoreEditorState = async () => {
  // 关键：主动请求 webContents 获得焦点（这是根本原因）
  if (window.electronAPI && window.electronAPI.focusWindow) {
    await window.electronAPI.focusWindow();
  }
  
  // 确保窗口获得焦点
  window.focus();
  
  // 关键：手动触发 focus 事件，让 React 组件能够响应
  window.dispatchEvent(new Event('focus'));
  
  // 使用状态管理器强制确保编辑器可编辑并恢复焦点
  editorStateManager.forceEditable();
  await editorStateManager.forceFocus();
  
  // 确保标题和分组输入框也可编辑
  const titleInput = document.querySelector('.title-input') as HTMLInputElement;
  if (titleInput) {
    titleInput.disabled = false;
    titleInput.readOnly = false;
    titleInput.removeAttribute('disabled');
    titleInput.removeAttribute('readonly');
  }
  const categoryInput = document.querySelector('input[list="categories-list"]') as HTMLInputElement;
  if (categoryInput) {
    categoryInput.disabled = false;
    categoryInput.readOnly = false;
    categoryInput.removeAttribute('disabled');
    categoryInput.removeAttribute('readonly');
  }
};

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [mode, setMode] = useState<Mode>('local');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部'); // '全部' 表示显示所有笔记
  const [isConfigLoaded, setIsConfigLoaded] = useState(false); // 标记配置是否已加载
  const [signature, setSignature] = useState<string>('MyNote2'); // 个性签名
  const [searchKeyword, setSearchKeyword] = useState<string>(''); // 搜索关键字
  const modeRef = useRef<Mode>('local'); // 使用 ref 保存当前模式，避免闭包问题

  // 初始化编辑器状态管理器
  useEffect(() => {
    // 设置焦点窗口回调
    editorStateManager.setFocusWindowCallback(async () => {
      if (window.electronAPI && window.electronAPI.focusWindow) {
        await window.electronAPI.focusWindow();
      }
    });
  }, []);

  // 全局编辑器状态守护机制 - 确保编辑器时时刻刻可编辑（已迁移到 editorStateManager）
  useEffect(() => {
    const forceEditorEditable = () => {
      const editorElement = document.querySelector('.editor-content') as HTMLElement;
      if (editorElement) {
        // 强制设置为可编辑
        if (editorElement.contentEditable !== 'true') {
          editorElement.removeAttribute('contenteditable');
          editorElement.setAttribute('contenteditable', 'true');
        }
        // 确保 disabled 和 readOnly 属性不存在
        editorElement.removeAttribute('disabled');
        editorElement.removeAttribute('readonly');
      }
      
      // 确保标题和分组输入框可编辑
      const titleInput = document.querySelector('.title-input') as HTMLInputElement;
      if (titleInput) {
        titleInput.disabled = false;
        titleInput.readOnly = false;
        titleInput.removeAttribute('disabled');
        titleInput.removeAttribute('readonly');
      }
      
      const categoryInput = document.querySelector('input[list="categories-list"]') as HTMLInputElement;
      if (categoryInput) {
        categoryInput.disabled = false;
        categoryInput.readOnly = false;
        categoryInput.removeAttribute('disabled');
        categoryInput.removeAttribute('readonly');
      }
    };

    // 每 100ms 强制检查一次（非常频繁，确保时时刻刻可编辑）
    // 但是要排除搜索框，避免干扰搜索
    const interval = setInterval(() => {
      const activeElement = document.activeElement;
      // 如果当前焦点在搜索框，不执行强制检查
      if (activeElement?.classList.contains('search-input') ||
          activeElement?.closest('.search-input') !== null ||
          activeElement?.closest('input.search-input') !== null) {
        return; // 不干扰搜索框
      }
      forceEditorEditable();
    }, 100);
    
    // 立即执行一次
    forceEditorEditable();
    
    // 不再监听全局点击和键盘事件来强制聚焦编辑器
    // 让用户点击哪里，焦点就在哪里
    // 只在笔记切换时手动聚焦编辑器
  }, []); // 只在组件挂载时设置一次，不依赖任何状态

  // 加载保存的配置（模式、选中的分组和个性签名）
  useEffect(() => {
    const loadSavedConfig = async () => {
      if (window.electronAPI) {
        try {
          const config = await window.electronAPI.getMode();
          setMode(config.mode);
          setSelectedCategory(config.selectedCategory || '全部');
          setSignature(config.signature || 'MyNote2');
          setIsConfigLoaded(true); // 标记配置已加载
        } catch (error) {
          console.error('加载保存的配置失败:', error);
          setIsConfigLoaded(true); // 即使加载失败也标记为已加载，避免后续问题
        }
      } else {
        setIsConfigLoaded(true);
      }
    };
    loadSavedConfig();
  }, []);

  // 当模式或选中的分组改变时保存（仅在配置加载后）
  useEffect(() => {
    if (!isConfigLoaded) return; // 配置未加载时不保存
    
    const saveConfig = async () => {
      if (window.electronAPI) {
        try {
          await window.electronAPI.saveMode(mode, selectedCategory);
        } catch (error) {
          console.error('保存配置失败:', error);
        }
      }
    };
    if (mode) {
      saveConfig();
    }
  }, [mode, selectedCategory, isConfigLoaded]);

  const handleExportNotes = useCallback(async () => {
    try {
      if (!window.electronAPI) {
        alert('错误：无法连接到 Electron API');
        return;
      }
      const result = await window.electronAPI.exportNotes(mode);
      if (result.success) {
        await window.electronAPI.showAlertDialog(`导出成功！\n文件夹已保存到：${result.filePath}\n包含 notes.md 文件和 images 文件夹`, '导出成功');
      } else {
        await window.electronAPI.showAlertDialog(`导出失败：${result.error || '未知错误'}`, '导出失败');
      }
    } catch (error) {
      console.error('导出笔记失败:', error);
      await window.electronAPI.showAlertDialog(`导出失败：${error instanceof Error ? error.message : String(error)}`, '导出失败');
    }
  }, [mode]);

  // 配置数据库的函数（热加载版本）
  const handleConfigureDatabase = async () => {
    // 保存当前光标位置
    const editorElement = document.querySelector('.editor-content') as HTMLElement;
    let savedCursorPosition: any = null;
    if (editorElement) {
      savedCursorPosition = saveCursorPosition(editorElement);
    }
    
    try {
      // 直接选择配置文件
      const result = await window.electronAPI.selectConfigFile();
      if (!result.success) {
        if (result.error !== '用户取消选择') {
          await window.electronAPI.showAlertDialog(`选择配置文件失败：${result.error || '未知错误'}`, '错误');
        }
        // 恢复光标（使用新的状态管理器）
        if (editorElement && savedCursorPosition) {
          editorStateManager.forceEditable();
          setTimeout(() => {
            restoreCursorPosition(editorElement, savedCursorPosition);
            editorStateManager.forceFocus();
          }, 50);
        }
        return;
      }

      if (result.config) {
        // 配置加载成功，直接弹出密码输入框
        const password = await window.electronAPI.requestPassword();
        if (!password) {
          await window.electronAPI.showAlertDialog('未输入密码，配置未完成', '提示');
          // 恢复光标
          if (editorElement && savedCursorPosition) {
            ensureEditorEditable(editorElement);
            setTimeout(() => {
              restoreCursorPosition(editorElement, savedCursorPosition);
            }, 50);
          }
          return;
        }

        // 保存密码
        await window.electronAPI.savePassword(password);

        // 测试连接并保存配置
        const fullConfig = {
          ...result.config,
          password: password
        };
        const testResult = await window.electronAPI.testCloudDB(fullConfig);
        if (testResult.success) {
          // 显示配置中提示
          if (window.electronAPI && window.electronAPI.showConfigProgressDialog) {
            await window.electronAPI.showConfigProgressDialog();
          }
          
          const connectResult = await window.electronAPI.connectCloudDB(fullConfig);
          if (connectResult.success) {
            // 关闭配置中提示
            if (window.electronAPI && window.electronAPI.closeConfigProgressDialog) {
              await window.electronAPI.closeConfigProgressDialog();
            }
            
            // 热加载：清理状态并重新加载
            setNotes([]);
            setSelectedNote(null);
            setSelectedCategory('全部');
            
            // 显示配置完成提示，然后重启应用
            if (window.electronAPI && window.electronAPI.showConfigSuccessDialog) {
              await window.electronAPI.showConfigSuccessDialog();
            }
            // 重启应用
            if (window.electronAPI && window.electronAPI.restartApp) {
              await window.electronAPI.restartApp();
            }
          } else {
            // 关闭配置中提示
            if (window.electronAPI && window.electronAPI.closeConfigProgressDialog) {
              await window.electronAPI.closeConfigProgressDialog();
            }
            await window.electronAPI.showAlertDialog('连接失败', '连接失败');
            // 恢复光标
            if (editorElement && savedCursorPosition) {
              const { restoreCursorPosition, ensureEditorEditable } = await import('./utils/cursorManager');
              ensureEditorEditable(editorElement);
              setTimeout(() => {
                restoreCursorPosition(editorElement, savedCursorPosition);
              }, 50);
            }
          }
        } else {
          // 关闭配置中提示（如果已显示）
          if (window.electronAPI && window.electronAPI.closeConfigProgressDialog) {
            await window.electronAPI.closeConfigProgressDialog();
          }
          await window.electronAPI.showAlertDialog('连接失败', '测试失败');
          // 恢复光标
          if (editorElement && savedCursorPosition) {
            ensureEditorEditable(editorElement);
            setTimeout(() => {
              restoreCursorPosition(editorElement, savedCursorPosition);
            }, 50);
          }
        }
      }
    } catch (error) {
      console.error('配置数据库失败:', error);
      await window.electronAPI.showAlertDialog(`配置失败：${error instanceof Error ? error.message : '未知错误'}`, '配置失败');
      // 恢复光标
      if (editorElement && savedCursorPosition) {
        const { restoreCursorPosition, ensureEditorEditable } = await import('./utils/cursorManager');
        ensureEditorEditable(editorElement);
        setTimeout(() => {
          restoreCursorPosition(editorElement, savedCursorPosition);
        }, 50);
      }
    }
  };

  // 更新 modeRef 当 mode 改变时
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    // 切换模式时，立即清空所有状态，避免数据混淆
    // 使用函数式更新确保立即清空
    setSelectedNote(null);
    setNotes([]);
    setSelectedCategory('全部'); // 重置分组选择为"全部"
    setLoading(true);
    
    // 更新 modeRef
    modeRef.current = mode;
    
    // 立即加载新模式的笔记，不延迟
    loadNotes();
    
    // 加载完成后，恢复编辑器状态（只执行一次，减少不必要的调用）
    const timer = setTimeout(() => {
      restoreEditorState();
    }, 200);
    
    return () => clearTimeout(timer);
  }, [mode]);

  // 监听菜单导出事件
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onMenuExport) {
      // 监听来自主进程的导出消息
      const removeListener = window.electronAPI.onMenuExport(handleExportNotes);
      return () => {
        removeListener();
      };
    }
  }, [handleExportNotes]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        // 检查 electronAPI 是否可用
        if (!window.electronAPI) {
          console.error('window.electronAPI 未定义 - 可能是在浏览器中运行，而不是 Electron');
          console.error('请在 Electron 应用窗口中运行，运行命令：npm run dev');
          setNotes([]);
          return;
        }
        
        // 明确传递 'local' 模式，确保一致性
        const notesData = await window.electronAPI.getNotes('local');
        setNotes(notesData || []);
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const notesData = await window.electronAPI.getNotes('cloud');
          setNotes(notesData || []);
        } catch (error) {
          console.error('加载云端笔记失败:', error);
          setNotes([]);
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('未配置') || errorMsg.includes('未连接')) {
            // 自动触发配置流程
            handleConfigureDatabase();
          }
        }
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  // 获取所有分组列表（使用 useMemo 优化，避免不必要的重新计算）
  // 使用稳定的排序和引用，避免频繁变化导致选择器闪烁
  const categories = useMemo((): string[] => {
    const categorySet = new Set<string>();
    notes.forEach(note => {
      if (note.category && note.category.trim()) {
        categorySet.add(note.category.trim());
      }
    });
    const sorted = Array.from(categorySet).sort();
    // 返回稳定的数组引用，只有当内容真正变化时才更新
    return sorted;
  }, [notes]);

  // 使用 useCallback 包装 onCategoryChange，确保引用稳定
  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  // 根据选中的分组和搜索关键字过滤笔记（使用 useMemo 优化，避免不必要的重新计算）
  const filteredNotes = useMemo(() => {
    // 先按分组过滤
    let categoryFiltered: Note[];
    if (selectedCategory === '全部') {
      categoryFiltered = notes;
    } else if (selectedCategory === '未分组') {
      categoryFiltered = notes.filter(note => !note.category || !note.category.trim());
    } else {
      categoryFiltered = notes.filter(note => note.category && note.category.trim() === selectedCategory);
    }
    
    // 如果有搜索关键字，再按关键字过滤
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      return categoryFiltered.filter(note => {
        // 匹配标题
        const titleMatch = (note.title || '').toLowerCase().includes(keyword);
        // 匹配内容（去除HTML标签）
        const contentText = (note.content || '').replace(/<[^>]*>/g, '').toLowerCase();
        const contentMatch = contentText.includes(keyword);
        return titleMatch || contentMatch;
      });
    }
    
    return categoryFiltered;
  }, [notes, selectedCategory, searchKeyword]);

  const handleCreateNote = async () => {
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        // 检查 electronAPI 是否可用
        if (!window.electronAPI) {
          await window.electronAPI.showAlertDialog('错误：无法连接到 Electron API。\n\n请在 Electron 应用窗口中运行，而不是在浏览器中。\n\n如果 Electron 窗口没有打开，请运行：npm run dev', '错误');
          console.error('window.electronAPI 未定义 - 可能是在浏览器中运行，而不是 Electron');
          return;
        }
        
        // 使用当前选中的分组作为新笔记的分组
        const category = selectedCategory === '全部' || selectedCategory === '未分组' ? undefined : selectedCategory;
        const newNote = await window.electronAPI.createNote('新笔记', 'local', category);
        
        if (!newNote) {
          await window.electronAPI.showAlertDialog('创建笔记失败：返回值为空', '创建失败');
          console.error('createNote 返回 null');
          return;
        }
        
        // 新笔记应该放在置顶笔记之后，未置顶笔记之前
        // 按照 isPinned DESC, updatedAt DESC 排序
        const sortedNotes = [newNote, ...notes].sort((a, b) => {
          const aPinned = a.isPinned || 0;
          const bPinned = b.isPinned || 0;
          if (aPinned !== bPinned) {
            return bPinned - aPinned; // 置顶的在前
          }
          // 如果置顶状态相同，按更新时间降序
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setNotes(sortedNotes);
        // 立即设置选中笔记，让编辑器能够初始化
        setSelectedNote(newNote);
        // 使用额外的延迟确保编辑器完全初始化，并给按钮点击事件时间完成
        setTimeout(() => {
          // 确保编辑器已经准备好
          setSelectedNote(prev => prev?.id === newNote.id ? newNote : prev);
        }, 300);
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const newNote = await window.electronAPI.createNote('新笔记', 'cloud');
          if (newNote) {
            // 新笔记应该放在置顶笔记之后，未置顶笔记之前
            // 按照 isPinned DESC, updatedAt DESC 排序
            const sortedNotes = [newNote, ...notes].sort((a, b) => {
              const aPinned = a.isPinned || 0;
              const bPinned = b.isPinned || 0;
              if (aPinned !== bPinned) {
                return bPinned - aPinned; // 置顶的在前
              }
              // 如果置顶状态相同，按更新时间降序
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            setNotes(sortedNotes);
            // 立即设置选中笔记，让编辑器能够初始化
            setSelectedNote(newNote);
            // 使用额外的延迟确保编辑器完全初始化，并给按钮点击事件时间完成
            setTimeout(() => {
              // 确保编辑器已经准备好
              setSelectedNote(prev => prev?.id === newNote.id ? newNote : prev);
            }, 300);
          }
        } catch (error) {
          console.error('创建云端笔记失败:', error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          await window.electronAPI.showAlertDialog(`创建笔记失败：${errorMsg}`, '创建失败');
          if (errorMsg.includes('未配置') || errorMsg.includes('未连接')) {
            // 自动触发配置流程
            const configBtn = document.querySelector('button[onclick*="selectConfigFile"]') as HTMLButtonElement;
            if (configBtn) {
              configBtn.click();
            }
          }
        }
      }
    } catch (error) {
      console.error('创建笔记失败:', error);
      await window.electronAPI.showAlertDialog(`创建笔记失败：${error instanceof Error ? error.message : String(error)}`, '创建失败');
    }
  };

  const handleSelectNote = async (noteId: number) => {
    try {
      // 在切换笔记前，如果当前有选中的笔记，先保存其内容
      // 这个保存会在 SimpleEditor 的 useEffect 中处理，但为了确保，我们也在这里触发一次
      // 实际上，SimpleEditor 会在 note 改变时自动保存之前笔记的内容
      
      // 标记这是用户主动选择笔记
      if (window.electronAPI && (window.electronAPI as any).setUserSelectingNote) {
        (window.electronAPI as any).setUserSelectingNote(true);
      }
      
      // 确保使用当前模式
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        const note = await window.electronAPI.getNote(noteId);
        if (note) {
          setSelectedNote(note);
        }
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const note = await window.electronAPI.getNote(noteId, 'cloud');
          if (note) {
            setSelectedNote(note);
          }
        } catch (error) {
          console.error('加载云端笔记失败:', error);
          await window.electronAPI.showAlertDialog(`加载笔记失败：${error instanceof Error ? error.message : String(error)}`, '加载失败');
        }
      }
    } catch (error) {
      console.error('加载笔记失败:', error);
    }
  };

  const handleUpdateNote = async (id: number, title: string, content: string, category?: string) => {
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        const success = await window.electronAPI.updateNote(id, title, content, 'local', category);
        if (success) {
          // 立即更新本地状态，避免重新加载整个列表导致抖动
          // 只更新当前笔记的 title、content 和 updatedAt，保留其他字段
          setNotes(prevNotes => 
            prevNotes.map(note => 
              note.id === id 
                ? { 
                    ...note, 
                    title, 
                    content, 
                    category: category !== undefined ? (category || '') : note.category,
                    updatedAt: new Date().toISOString() 
                  }
                : note
            )
          );
          
          // 如果当前选中的笔记就是更新的笔记，只更新其内容，不重新获取
          if (selectedNote && selectedNote.id === id) {
            // 立即更新 selectedNote，但使用函数式更新避免不必要的重新渲染
            setSelectedNote(prev => {
              if (prev && prev.id === id) {
                return {
                  ...prev,
                  title,
                  content,
                  category: category !== undefined ? (category || '') : prev.category,
                  updatedAt: new Date().toISOString(),
                };
              }
              return prev;
            });
          }
        }
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const success = await window.electronAPI.updateNote(id, title, content, 'cloud', category);
          if (success) {
            // 立即更新本地状态，避免重新加载整个列表导致抖动
            // 只更新当前笔记的 title、content 和 updatedAt，保留其他字段
            setNotes(prevNotes => 
              prevNotes.map(note => 
                note.id === id 
                  ? { 
                      ...note, 
                      title, 
                      content, 
                      category: category !== undefined ? (category || '') : note.category,
                      updatedAt: new Date().toISOString() 
                    }
                  : note
              )
            );
            
            // 如果当前选中的笔记就是更新的笔记，只更新其内容，不重新获取
            if (selectedNote && selectedNote.id === id) {
              // 立即更新 selectedNote，但使用函数式更新避免不必要的重新渲染
              // 重要：如果 category 未传递，保留原有的 category，避免分组丢失
              setSelectedNote(prev => {
                if (prev && prev.id === id) {
                  return {
                    ...prev,
                    title,
                    content,
                    // 如果 category 未传递，保留原有的 category；如果传递了，使用新值
                    category: category !== undefined ? (category || '') : prev.category,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return prev;
              });
            }
          }
        } catch (error) {
          console.error('更新云端笔记失败:', error);
          await window.electronAPI.showAlertDialog(`更新笔记失败：${error instanceof Error ? error.message : String(error)}`, '更新失败');
        }
      }
    } catch (error) {
      console.error('更新笔记失败:', error);
    }
  };

  const handleUpdateNoteCategory = async (id: number, category: string) => {
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      const success = await window.electronAPI.updateNoteCategory(id, category, currentMode);
      if (success) {
        const updatedCategory = category ? category.trim() : '';
        
        // 立即更新本地状态中的笔记分组（确保UI快速响应）
        setNotes(prevNotes => 
          prevNotes.map(note => 
            note.id === id ? { ...note, category: updatedCategory } : note
          )
        );
        
        // 更新当前选中的笔记，确保 category 字段正确更新
        // 使用函数式更新，避免不必要的重新渲染
        // 重要：立即更新 selectedNote，确保分组输入框显示正确的值
        if (selectedNote && selectedNote.id === id) {
          setSelectedNote(prev => {
            if (prev && prev.id === id) {
              return {
                ...prev,
                category: updatedCategory,
              };
            }
            return prev;
          });
        }
        
        // 不自动切换左侧分组选择，保持用户当前的选择
        
        // 不重新加载整个列表，避免导致列表抖动
        // 本地状态已经更新，数据库也已经更新，不需要重新加载
      }
    } catch (error) {
      console.error('更新笔记分组失败:', error);
    }
  };

  const handleDeleteNote = async (id: number) => {
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        const success = await window.electronAPI.deleteNote(id);
        if (success) {
          // 立即更新本地状态，不触发 loading，避免页面刷新感
          const updatedNotes = notes.filter(note => note.id !== id);
          setNotes(updatedNotes);
          
          // 如果删除的是当前选中的笔记，选择第一个笔记（如果有）
          if (selectedNote?.id === id) {
            if (updatedNotes.length > 0) {
              const firstNote = updatedNotes[0];
              setSelectedNote(firstNote);
              // 使用 setTimeout 确保 DOM 更新后再尝试设置焦点和可编辑性
              setTimeout(() => {
                // 尝试设置焦点到编辑器
                const editorElement = document.querySelector('.editor-content') as HTMLElement;
                if (editorElement) {
                  editorElement.contentEditable = 'true';
                  if (editorElement.contentEditable !== 'true') {
                    editorElement.removeAttribute('contenteditable');
                    editorElement.setAttribute('contenteditable', 'true');
                  }
                  try {
                    editorElement.focus();
                  } catch (e) {
                    // 忽略错误
                  }
                }
                // 确保标题和分组输入框也可编辑
                const titleInput = document.querySelector('.title-input') as HTMLInputElement;
                if (titleInput) {
                  titleInput.disabled = false;
                  titleInput.readOnly = false;
                }
                const categoryInput = document.querySelector('input[list="categories-list"]') as HTMLInputElement;
                if (categoryInput) {
                  categoryInput.disabled = false;
                  categoryInput.readOnly = false;
                }
              }, 100);
            } else {
              setSelectedNote(null);
            }
          }
        }
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const success = await window.electronAPI.deleteNote(id, 'cloud');
          if (success) {
            // 立即更新本地状态，不触发 loading，避免页面刷新感
            const updatedNotes = notes.filter(note => note.id !== id);
            setNotes(updatedNotes);
            
            // 如果删除的是当前选中的笔记，选择第一个笔记（如果有）
            if (selectedNote?.id === id) {
              if (updatedNotes.length > 0) {
                const firstNote = updatedNotes[0];
                setSelectedNote(firstNote);
                // 使用 setTimeout 确保 DOM 更新后再尝试设置焦点和可编辑性
                setTimeout(() => {
                  // 尝试设置焦点到编辑器
                  const editorElement = document.querySelector('.editor-content') as HTMLElement;
                  if (editorElement) {
                    editorElement.contentEditable = 'true';
                    if (editorElement.contentEditable !== 'true') {
                      editorElement.removeAttribute('contenteditable');
                      editorElement.setAttribute('contenteditable', 'true');
                    }
                    try {
                      editorElement.focus();
                    } catch (e) {
                      // 忽略错误
                    }
                  }
                  // 确保标题和分组输入框也可编辑
                  const titleInput = document.querySelector('.title-input') as HTMLInputElement;
                  if (titleInput) {
                    titleInput.disabled = false;
                    titleInput.readOnly = false;
                  }
                  const categoryInput = document.querySelector('input[list="categories-list"]') as HTMLInputElement;
                  if (categoryInput) {
                    categoryInput.disabled = false;
                    categoryInput.readOnly = false;
                  }
                }, 100);
              } else {
                setSelectedNote(null);
              }
            }
          }
        } catch (error) {
          console.error('删除云端笔记失败:', error);
          await window.electronAPI.showAlertDialog(`删除笔记失败：${error instanceof Error ? error.message : String(error)}`, '删除失败');
        }
      }
    } catch (error) {
      console.error('删除笔记失败:', error);
    }
  };

  const handleTogglePin = async (id: number) => {
    try {
      // 确保使用当前模式，避免模式切换后使用错误的模式（使用 ref 获取最新值）
      const currentMode = modeRef.current;
      if (currentMode === 'local') {
        const success = await window.electronAPI.togglePinNote(id);
        if (success) {
          // 立即更新本地状态，更新置顶状态并重新排序
          setNotes(prevNotes => {
            // 先更新置顶状态
            const updatedNotes = prevNotes.map(note => 
              note.id === id 
                ? { ...note, isPinned: (note.isPinned || 0) === 1 ? 0 : 1 }
                : note
            );
            // 然后按照置顶状态和更新时间排序（置顶在前，按更新时间降序）
            return updatedNotes.sort((a, b) => {
              const aPinned = a.isPinned || 0;
              const bPinned = b.isPinned || 0;
              if (aPinned !== bPinned) {
                return bPinned - aPinned; // 置顶的在前
              }
              // 如果置顶状态相同，按更新时间降序
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
          });
        }
      } else if (currentMode === 'cloud') {
        // 云端模式
        try {
          const success = await window.electronAPI.togglePinNote(id, 'cloud');
          if (success) {
            // 立即更新本地状态，更新置顶状态并重新排序
            setNotes(prevNotes => {
              // 先更新置顶状态
              const updatedNotes = prevNotes.map(note => 
                note.id === id 
                  ? { ...note, isPinned: (note.isPinned || 0) === 1 ? 0 : 1 }
                  : note
              );
              // 然后按照置顶状态和更新时间排序（置顶在前，按更新时间降序）
              return updatedNotes.sort((a, b) => {
                const aPinned = a.isPinned || 0;
                const bPinned = b.isPinned || 0;
                if (aPinned !== bPinned) {
                  return bPinned - aPinned; // 置顶的在前
                }
                // 如果置顶状态相同，按更新时间降序
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
              });
            });
          }
        } catch (error) {
          console.error('切换置顶状态失败:', error);
          await window.electronAPI.showAlertDialog(`操作失败：${error instanceof Error ? error.message : String(error)}`, '操作失败');
        }
      }
    } catch (error) {
      console.error('切换置顶状态失败:', error);
    }
  };

  // 处理个性签名变化
  const handleSignatureChange = async (newSignature: string) => {
    setSignature(newSignature);
    if (window.electronAPI) {
      try {
        await window.electronAPI.saveSignature(newSignature);
      } catch (error) {
        console.error('保存签名失败:', error);
      }
    }
  };

  // 如果 electronAPI 不可用，显示错误信息
  if (typeof window === 'undefined' || !window.electronAPI) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>{signature || 'MyNote2'}</h1>
        <p style={{ color: 'red', marginTop: '20px' }}>
          错误：无法连接到 Electron API
        </p>
        <p>请确保在 Electron 应用窗口中运行</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <input
          type="text"
          value={signature}
          onChange={(e) => handleSignatureChange(e.target.value)}
          onBlur={(e) => handleSignatureChange(e.target.value)}
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#333',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: '0',
            margin: '0',
            width: 'auto',
            minWidth: '100px',
            maxWidth: '300px'
          }}
          placeholder="个性签名"
        />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleExportNotes}
            style={{
              padding: '6px 12px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
            title="导出所有笔记为 Markdown 文件 (Ctrl+E)"
          >
            导出笔记
          </button>
          {mode === 'cloud' && (
            <>
              <button
                onClick={handleConfigureDatabase}
                style={{
                  padding: '6px 12px',
                  background: '#f5f5f5',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                配置数据库
              </button>
              <button
                onClick={async () => {
                  const confirmed = await window.electronAPI.showConfirmDialog(
                    '确定要断开数据库连接吗？这将清除所有配置信息，需要重新配置。',
                    '确认断开连接'
                  );
                  if (confirmed) {
                    // 保存当前光标位置
                    const editorElement = document.querySelector('.editor-content') as HTMLElement;
                    let savedCursorPosition: any = null;
                    if (editorElement) {
                      savedCursorPosition = saveCursorPosition(editorElement);
                    }
                    
                    try {
                      const result = await window.electronAPI.clearCloudConfig();
                      if (result.success) {
                        // 显示自定义选择对话框
                        const choice = await window.electronAPI.showRestartQuitDialog();
                        
                        if (choice === 'restart') {
                          // 用户选择重启
                          if (window.electronAPI && window.electronAPI.restartApp) {
                            await window.electronAPI.restartApp();
                          }
                        } else if (choice === 'quit') {
                          // 用户选择关闭
                          if (window.electronAPI && window.electronAPI.quitApp) {
                            await window.electronAPI.quitApp();
                          }
                        }
                        // 如果 choice 是 null（用户关闭窗口），不做任何操作
                      } else {
                        await window.electronAPI.showAlertDialog(`断开连接失败：${result.error || '未知错误'}`, '断开失败');
                        // 恢复光标
                        if (editorElement && savedCursorPosition) {
                          editorStateManager.forceEditable();
                          setTimeout(() => {
                            restoreCursorPosition(editorElement, savedCursorPosition);
                          }, 50);
                        }
                      }
                    } catch (error) {
                      await window.electronAPI.showAlertDialog(`断开连接失败：${error instanceof Error ? error.message : '未知错误'}`, '断开失败');
                      // 恢复光标
                      if (editorElement && savedCursorPosition) {
                        const { restoreCursorPosition, ensureEditorEditable } = await import('./utils/cursorManager');
                        ensureEditorEditable(editorElement);
                        setTimeout(() => {
                          restoreCursorPosition(editorElement, savedCursorPosition);
                        }, 50);
                      }
                    }
                  }
                }}
                style={{
                  padding: '6px 12px',
                  background: '#ffebee',
                  border: '1px solid #f44336',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#c62828'
                }}
                title="断开数据库连接并清除配置"
              >
                断开数据库
              </button>
            </>
          )}
          <ModeSelector mode={mode} onModeChange={setMode} />
        </div>
      </div>
      <div className="app-content">
        <NoteList
          notes={filteredNotes}
          selectedNoteId={selectedNote?.id}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={handleDeleteNote}
          onTogglePin={handleTogglePin}
          mode={mode}
          loading={loading}
          selectedCategory={selectedCategory}
          categories={categories}
          onCategoryChange={handleCategoryChange}
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
        />
        <SimpleEditor
          note={selectedNote}
          onUpdateNote={handleUpdateNote}
          onUpdateCategory={handleUpdateNoteCategory}
          mode={mode}
          categories={categories}
        />
      </div>
    </div>
  );
}

export default App;

