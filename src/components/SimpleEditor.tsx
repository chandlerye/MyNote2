import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Note } from '../App';
import { saveCursorPosition, restoreCursorPosition } from '../utils/cursorManager';
import { editorStateManager } from '../utils/editorStateManager';
import './SimpleEditor.css';

interface SimpleEditorProps {
  note: Note | null;
  onUpdateNote: (id: number, title: string, content: string, category?: string) => void;
  onUpdateCategory?: (id: number, category: string) => void;
  mode: 'local' | 'cloud';
  categories: string[];
}

const SimpleEditor: React.FC<SimpleEditorProps> = ({ note, onUpdateNote, onUpdateCategory, mode, categories }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const categorySaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastNoteIdRef = useRef<number | null>(null);
  const isUserSelectingRef = useRef(false);
  const isEditingRef = useRef(false); // 跟踪是否正在编辑
  const lastContentRef = useRef<string>(''); // 跟踪最后的内容，避免不必要的更新
  const isCategoryEditingRef = useRef(false); // 跟踪是否正在编辑分组
  const lastCategoryRef = useRef<string>(''); // 跟踪最后的分组值，避免不必要的更新
  const isTitleEditingRef = useRef(false); // 跟踪是否正在编辑标题
  const lastTitleRef = useRef<string>(''); // 跟踪最后的标题值，避免不必要的更新

  // 定期检查并确保所有输入框可编辑（防止意外变为不可编辑）
  // 但不再强制恢复焦点 - 让用户点击哪里，焦点就在哪里
  useEffect(() => {
    const checkAllEditable = () => {
      // 检查编辑器（无论是否有 note）
      if (editorRef.current) {
        if (editorRef.current.contentEditable !== 'true') {
          console.log('检测到编辑器不可编辑，正在修复...');
          editorRef.current.contentEditable = 'true';
          if (editorRef.current.contentEditable !== 'true') {
            editorRef.current.removeAttribute('contenteditable');
            editorRef.current.setAttribute('contenteditable', 'true');
          }
        }
        // 不再强制恢复焦点 - 让用户点击哪里，焦点就在哪里
      }
      // 检查标题输入框
      if (titleInputRef.current) {
        if (titleInputRef.current.disabled || titleInputRef.current.readOnly) {
          console.log('检测到标题输入框不可编辑，正在修复...');
          titleInputRef.current.disabled = false;
          titleInputRef.current.readOnly = false;
        }
      }
      // 检查分组输入框
      if (categoryInputRef.current) {
        if (categoryInputRef.current.disabled || categoryInputRef.current.readOnly) {
          console.log('检测到分组输入框不可编辑，正在修复...');
          categoryInputRef.current.disabled = false;
          categoryInputRef.current.readOnly = false;
        }
      }
    };

    // 每 500ms 检查一次（降低频率，只确保可编辑，不强制聚焦）
    const interval = setInterval(checkAllEditable, 500);
    
    // 立即执行一次检查
    checkAllEditable();
    
    // 使用 requestAnimationFrame 在每一帧都检查一次（最激进的策略）
    let rafId: number;
    const checkInFrame = () => {
      checkAllEditable();
      rafId = requestAnimationFrame(checkInFrame);
    };
    rafId = requestAnimationFrame(checkInFrame);
    
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
    };
  }, [note]);

  // 监听窗口焦点事件，确保编辑器在窗口重新获得焦点时也能正常工作
  useEffect(() => {
    const handleWindowFocus = () => {
      console.log('窗口获得焦点，恢复编辑器状态');
      
      // 当窗口重新获得焦点时，确保所有输入框可编辑
      // 无论是否有 note，都确保编辑器可编辑（为空状态时也需要可编辑）
      if (editorRef.current) {
        // 立即确保可编辑
        if (editorRef.current.contentEditable !== 'true') {
          console.log('修复编辑器 contentEditable');
          editorRef.current.contentEditable = 'true';
          if (editorRef.current.contentEditable !== 'true') {
            editorRef.current.removeAttribute('contenteditable');
            editorRef.current.setAttribute('contenteditable', 'true');
          }
        }
      }
      
      // 确保标题和分组输入框可编辑
      if (titleInputRef.current) {
        if (titleInputRef.current.disabled || titleInputRef.current.readOnly) {
          console.log('修复标题输入框');
          titleInputRef.current.disabled = false;
          titleInputRef.current.readOnly = false;
        }
      }
      if (categoryInputRef.current) {
        if (categoryInputRef.current.disabled || categoryInputRef.current.readOnly) {
          console.log('修复分组输入框');
          categoryInputRef.current.disabled = false;
          categoryInputRef.current.readOnly = false;
        }
      }
      
      // 延迟一下，确保属性设置完成
      setTimeout(() => {
        if (editorRef.current) {
          // 再次确保可编辑
          if (editorRef.current.contentEditable !== 'true') {
            editorRef.current.removeAttribute('contenteditable');
            editorRef.current.setAttribute('contenteditable', 'true');
          }
          // 不再自动聚焦 - 让用户点击哪里，焦点就在哪里
        }
      }, 50);
    };

    const handleWindowBlur = () => {
      // 窗口失去焦点时，确保编辑器状态正确
      if (editorRef.current && note) {
        // 即使失去焦点，也要确保可编辑属性正确
        if (editorRef.current.contentEditable !== 'true') {
          editorRef.current.contentEditable = 'true';
        }
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [note]);

  useEffect(() => {
    if (note) {
      const isNewNote = lastNoteIdRef.current !== note.id;
      const wasDifferentNote = lastNoteIdRef.current !== note.id;
      
      // 保存当前光标位置（在切换笔记前）
      let savedCursorPosition: any = null;
      if (wasDifferentNote && editorRef.current) {
        savedCursorPosition = saveCursorPosition(editorRef.current);
      }
      
      // 如果切换到不同的笔记，先保存之前笔记的内容
      if (wasDifferentNote && lastNoteIdRef.current !== null) {
        const currentContent = editorRef.current ? editorRef.current.innerHTML : content;
        const currentTitle = title;
        const currentCategory = category;
        // 如果有未保存的更改，立即保存
        if (currentContent !== lastContentRef.current || 
            currentTitle !== lastTitleRef.current || 
            currentCategory !== lastCategoryRef.current) {
          // 清除之前的防抖定时器，立即保存
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          if (categorySaveTimeoutRef.current) {
            clearTimeout(categorySaveTimeoutRef.current);
            categorySaveTimeoutRef.current = null;
          }
          // 立即保存之前笔记的内容
          onUpdateNote(lastNoteIdRef.current, currentTitle, currentContent, currentCategory);
          if (onUpdateCategory && currentCategory !== lastCategoryRef.current) {
            onUpdateCategory(lastNoteIdRef.current, currentCategory);
          }
          // 更新 ref，避免重复保存
          lastContentRef.current = currentContent;
          lastTitleRef.current = currentTitle;
          lastCategoryRef.current = currentCategory;
        }
      }
      
      lastNoteIdRef.current = note.id;
      
      // 检查当前焦点是否在标题输入框、分组输入框或编辑器
      const activeElement = document.activeElement;
      const isTitleFocused = activeElement === titleInputRef.current;
      const isCategoryFocused = activeElement === categoryInputRef.current;
      const isContentFocused = activeElement === editorRef.current;
      
      // 获取笔记的分组值
      const noteCategory = note.category ? String(note.category).trim() : '';
      
        // 如果是新笔记，直接更新所有值
        if (isNewNote || wasDifferentNote) {
          const noteTitle = note.title || '';
          setTitle(noteTitle);
          lastTitleRef.current = noteTitle; // 更新最后的标题值
          isTitleEditingRef.current = false; // 重置标题编辑状态
          // 确保分组值正确设置
          setCategory(noteCategory);
          lastCategoryRef.current = noteCategory; // 更新最后的分组值
          isCategoryEditingRef.current = false; // 重置分组编辑状态
          const noteContent = note.content || '';
          setContent(noteContent);
          lastContentRef.current = noteContent; // 更新最后的内容
          isEditingRef.current = false; // 重置编辑状态
          
          // 立即确保所有输入框可编辑
          if (titleInputRef.current) {
            titleInputRef.current.disabled = false;
            titleInputRef.current.readOnly = false;
          }
          if (categoryInputRef.current) {
            categoryInputRef.current.disabled = false;
            categoryInputRef.current.readOnly = false;
          }
          
          // 使用多个延迟确保 DOM 完全更新和焦点设置
          if (editorRef.current) {
            // 立即设置 contentEditable 和内容
            editorRef.current.contentEditable = 'true';
            // 如果设置失败，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            editorRef.current.innerHTML = noteContent;
          
          // 只在切换笔记时聚焦编辑器（默认行为）
          // 使用单个延迟确保 DOM 更新完成后再设置焦点
          requestAnimationFrame(() => {
            if (editorRef.current) {
              editorRef.current.contentEditable = 'true';
              setTimeout(() => {
                if (editorRef.current) {
                  try {
                    // 使用 preventScroll 避免滚动
                    editorRef.current.focus({ preventScroll: true });
                    
                    // 如果有保存的光标位置，尝试恢复
                    if (savedCursorPosition) {
                      restoreCursorPosition(editorRef.current, savedCursorPosition);
                    } else {
                      // 否则确保光标在编辑器内
                      const selection = window.getSelection();
                      if (selection) {
                        if (!editorRef.current.contains(selection.anchorNode)) {
                          // 光标不在编辑器内，尝试将光标移到末尾
                          const range = document.createRange();
                          range.selectNodeContents(editorRef.current);
                          range.collapse(false); // 移到末尾
                          selection.removeAllRanges();
                          selection.addRange(range);
                        }
                      }
                    }
                  } catch (e) {
                    console.log('编辑器焦点设置失败:', e);
                  }
                }
              }, 100);
            }
          });
        }
      } else {
        // 只有当标题或内容真正改变时才更新（避免编辑时的刷新）
        // 如果用户正在编辑标题，不要更新标题
        const noteTitle = note.title || '';
        if (!isTitleFocused && !isTitleEditingRef.current && noteTitle !== lastTitleRef.current) {
          setTitle(noteTitle);
          lastTitleRef.current = noteTitle;
        }
        
        // 如果用户没有在编辑分组，且分组值确实不同，才更新分组值
        // 重要：只有当用户没有在编辑分组时才更新，避免覆盖用户正在输入的内容
        if (!isCategoryFocused && !isCategoryEditingRef.current && noteCategory !== lastCategoryRef.current) {
          setCategory(noteCategory);
          lastCategoryRef.current = noteCategory;
        }
        
        // 如果内容改变，更新内容（但不要覆盖用户正在编辑的内容）
        // 重要：只有当编辑器没有焦点，且内容确实不同，且不是用户正在编辑时才更新
        const noteContent = note.content || '';
        const currentEditorContent = editorRef.current ? editorRef.current.innerHTML : '';
        
        // 只有当以下条件都满足时才更新：
        // 1. 编辑器没有焦点
        // 2. 用户没有正在编辑（通过 isEditingRef 跟踪）
        // 3. note.content 与当前编辑器内容不同
        // 4. note.content 与上次保存的内容不同（避免循环更新）
        if (!isContentFocused && !isEditingRef.current && noteContent !== currentEditorContent && noteContent !== lastContentRef.current) {
          setContent(noteContent);
          lastContentRef.current = noteContent;
          if (editorRef.current) {
            // 保存当前选择位置
            const selection = window.getSelection();
            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
            
            // 确保编辑器可编辑
            editorRef.current.contentEditable = 'true';
            editorRef.current.innerHTML = noteContent;
            
            // 重新包装图片（因为 innerHTML 会清除之前的包装）
            setTimeout(() => {
              const loadedImgs = editorRef.current?.querySelectorAll('img');
              if (loadedImgs && loadedImgs.length > 0) {
                loadedImgs.forEach((img) => {
                  // 如果图片还没有被包装，进行包装
                  if (!img.parentElement?.classList.contains('image-resize-wrapper')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-resize-wrapper';
                    img.parentNode?.insertBefore(wrapper, img);
                    wrapper.appendChild(img);
                    
                    // 创建8个调整手柄
                    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
                    handles.forEach(dir => {
                      const handle = document.createElement('div');
                      handle.className = `resize-handle ${dir}`;
                      handle.setAttribute('data-direction', dir);
                      wrapper.appendChild(handle);
                    });
                  }
                });
              }
            }, 50);
            
            // 恢复选择位置
            if (range && selection) {
              try {
                selection.removeAllRanges();
                selection.addRange(range);
              } catch (e) {
                // 如果恢复选择失败，忽略错误
              }
            }
          }
        }
      }
      
      // 确保编辑器始终可编辑（无论何时）
      // 使用 MutationObserver 监听 contentEditable 属性的变化
      if (editorRef.current) {
        // 立即确保可编辑
        editorRef.current.contentEditable = 'true';
        
        // 设置 MutationObserver 监听 contentEditable 属性的变化
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'contenteditable') {
              if (editorRef.current && editorRef.current.contentEditable !== 'true') {
                console.log('检测到 contentEditable 被意外修改，正在修复...');
                editorRef.current.contentEditable = 'true';
              }
            }
          });
        });
        
        observer.observe(editorRef.current, {
          attributes: true,
          attributeFilter: ['contenteditable']
        });
        
        // 清理 observer（在组件卸载或 note 改变时）
        return () => {
          observer.disconnect();
        };
      }
    } else {
      // note 为 null 时，清空所有内容，但确保所有输入框都是可编辑的
      setTitle('');
      setCategory('');
      lastCategoryRef.current = '';
      isCategoryEditingRef.current = false;
      isTitleEditingRef.current = false;
      isEditingRef.current = false;
      
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        // 强制确保编辑器可编辑
        editorRef.current.contentEditable = 'true';
        // 如果设置失败，尝试重新设置
        if (editorRef.current.contentEditable !== 'true') {
          editorRef.current.removeAttribute('contenteditable');
          editorRef.current.setAttribute('contenteditable', 'true');
        }
      }
      
      // 确保标题和分组输入框也是可编辑的
      if (titleInputRef.current) {
        titleInputRef.current.disabled = false;
        titleInputRef.current.readOnly = false;
      }
      if (categoryInputRef.current) {
        categoryInputRef.current.disabled = false;
        categoryInputRef.current.readOnly = false;
      }
      
      setContent('');
      lastNoteIdRef.current = null;
    }
    
    // 无论 note 是否存在，都确保所有输入框可编辑
    // 使用 setTimeout 确保在 DOM 更新后执行
    setTimeout(() => {
      if (editorRef.current) {
        if (editorRef.current.contentEditable !== 'true') {
          editorRef.current.removeAttribute('contenteditable');
          editorRef.current.setAttribute('contenteditable', 'true');
        }
      }
      if (titleInputRef.current) {
        titleInputRef.current.disabled = false;
        titleInputRef.current.readOnly = false;
      }
      if (categoryInputRef.current) {
        categoryInputRef.current.disabled = false;
        categoryInputRef.current.readOnly = false;
      }
    }, 0);
  }, [note]);

  // 处理图片大小调整（拖拽方式）
  const resizeStateRef = useRef({
    isResizing: false,
    resizeWrapper: null as HTMLElement | null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    resizeDirection: '',
  });

  // 使用 useRef 保存函数引用，确保事件监听器可以正确移除
  const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!note || !editorRef.current) return;

    const editor = editorRef.current;
    const state = resizeStateRef.current;
    
    // 包装图片，添加调整手柄
    const wrapImage = (img: HTMLImageElement) => {
      // 如果已经被包装过，跳过
      if (img.parentElement?.classList.contains('image-resize-wrapper')) {
        return;
      }
      
      const wrapper = document.createElement('div');
      wrapper.className = 'image-resize-wrapper';
      
      // 保存原始样式
      const originalStyle = img.getAttribute('style') || '';
      wrapper.setAttribute('data-original-style', originalStyle);
      
      // 确保包装器不会覆盖文本
      wrapper.style.display = 'inline-block';
      wrapper.style.verticalAlign = 'middle';
      wrapper.style.position = 'relative';
      
      // 将图片移动到包装器中
      img.parentNode?.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      
      // 创建8个调整手柄（四个角和四条边）
      const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
      handles.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${dir}`;
        handle.setAttribute('data-direction', dir);
        wrapper.appendChild(handle);
      });
    };
    
    // 处理鼠标移动
    const handleMouseMove = (e: MouseEvent) => {
      // 使用 ref 中的状态，确保获取最新值
      if (!state.isResizing || !state.resizeWrapper) {
        // 如果不在调整状态，移除事件监听器
        if (handleMouseMoveRef.current) {
          document.removeEventListener('mousemove', handleMouseMoveRef.current, true);
        }
        if (handleMouseUpRef.current) {
          document.removeEventListener('mouseup', handleMouseUpRef.current, true);
        }
        return;
      }
      
      const img = state.resizeWrapper.querySelector('img') as HTMLImageElement;
      if (!img) {
        state.isResizing = false;
        state.resizeWrapper = null;
        if (handleMouseMoveRef.current) {
          document.removeEventListener('mousemove', handleMouseMoveRef.current, true);
        }
        if (handleMouseUpRef.current) {
          document.removeEventListener('mouseup', handleMouseUpRef.current, true);
        }
        return;
      }
      
      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;
      
      let newWidth = state.startWidth;
      let newHeight = state.startHeight;
      
      // 根据拖拽方向计算新尺寸
      if (state.resizeDirection.includes('e')) {
        newWidth = state.startWidth + deltaX;
      }
      if (state.resizeDirection.includes('w')) {
        newWidth = state.startWidth - deltaX;
      }
      if (state.resizeDirection.includes('s')) {
        newHeight = state.startHeight + deltaY;
      }
      if (state.resizeDirection.includes('n')) {
        newHeight = state.startHeight - deltaY;
      }
      
      // 限制最小尺寸
      newWidth = Math.max(50, newWidth);
      newHeight = Math.max(50, newHeight);
      
      // 保持宽高比（如果拖拽的是角）
      if (state.resizeDirection.length === 2) {
        const aspectRatio = state.startWidth / state.startHeight;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }
      }
      
      // 限制最大宽度为编辑器宽度
      const editorRect = editor.getBoundingClientRect();
      if (newWidth > editorRect.width - 48) { // 48px 是 padding
        newWidth = editorRect.width - 48;
        if (state.resizeDirection.length === 2) {
          newHeight = newWidth / (state.startWidth / state.startHeight);
        }
      }
      
      // 应用新尺寸
      img.style.width = `${newWidth}px`;
      img.style.height = `${newHeight}px`;
    };
    
    // 处理鼠标释放
    const handleMouseUp = () => {
      // 立即停止调整状态
      const wasResizing = state.isResizing;
      const currentResizeWrapper = state.resizeWrapper;
      
      // 立即设置状态为 false，防止 handleMouseMove 继续执行
      state.isResizing = false;
      state.resizeWrapper = null;
      state.resizeDirection = '';
      
      // 立即移除事件监听器，防止后续的鼠标移动事件触发调整
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current, true);
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current, true);
      }
      
      if (wasResizing && currentResizeWrapper) {
        currentResizeWrapper.classList.remove('resizing');
        
        // 保存更改（需要先移除包装器，只保存图片本身）
        // 使用更安全的方式，避免影响前面的文本节点
        const wrappers = editor.querySelectorAll('.image-resize-wrapper');
        wrappers.forEach(wrapper => {
          const img = wrapper.querySelector('img');
          if (img && wrapper.parentNode) {
            // 保存图片的样式（包括宽度和高度）
            const imgStyle = img.style.cssText;
            // 使用 replaceChild 替换包装器为图片，这样可以保持DOM结构不变，不会影响前面的文本
            // 先克隆图片节点（深拷贝，包括所有属性）
            const clonedImg = img.cloneNode(true) as HTMLImageElement;
            // 应用图片样式
            if (imgStyle) {
              clonedImg.setAttribute('style', imgStyle);
            }
            // 复制所有属性
            Array.from(img.attributes).forEach(attr => {
              if (attr.name !== 'style') {
                clonedImg.setAttribute(attr.name, attr.value);
              }
            });
            // 替换包装器为图片（这样不会影响前面的文本节点）
            wrapper.parentNode.replaceChild(clonedImg, wrapper);
          }
        });
        
        const currentContent = editor.innerHTML;
        setContent(currentContent);
        lastContentRef.current = currentContent;
        
        // 立即保存，不等待防抖
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        
        const currentNote = note;
        const currentTitle = title;
        const currentCategory = category;
        
        setTimeout(async () => {
          if (currentNote) {
            await onUpdateNote(currentNote.id, currentTitle, currentContent, currentCategory);
          }
          
          // 保存后重新包装图片，以便下次可以调整
          setTimeout(() => {
            const images = editor.querySelectorAll('img');
            images.forEach(img => {
              if (!img.parentElement?.classList.contains('image-resize-wrapper')) {
                wrapImage(img as HTMLImageElement);
              }
            });
          }, 200);
        }, 100);
      }
    };
    
    // 保存函数引用到 ref
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    
    // 处理鼠标按下
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 检查是否点击了调整手柄或图片包装器
      if (target.classList.contains('resize-handle') || target.closest('.image-resize-wrapper')) {
        // 只有在点击调整手柄时才阻止默认行为
        if (target.classList.contains('resize-handle')) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        } else {
          // 点击图片包装器但不点击手柄时，不阻止，让文本输入正常工作
          return;
        }
        
        // 如果已经在调整，先停止
        if (state.isResizing && handleMouseUpRef.current) {
          handleMouseUpRef.current();
        }
        
        state.isResizing = true;
        state.resizeWrapper = target.closest('.image-resize-wrapper') as HTMLElement;
        state.resizeDirection = target.getAttribute('data-direction') || '';
        
        if (state.resizeWrapper) {
          state.resizeWrapper.classList.add('resizing');
          const img = state.resizeWrapper.querySelector('img') as HTMLImageElement;
          if (img) {
            const rect = img.getBoundingClientRect();
            state.startX = e.clientX;
            state.startY = e.clientY;
            state.startWidth = rect.width;
            state.startHeight = rect.height;
          }
        }
        
        // 使用捕获阶段，确保事件被优先处理
        if (handleMouseMoveRef.current) {
          document.addEventListener('mousemove', handleMouseMoveRef.current, true);
        }
        if (handleMouseUpRef.current) {
          document.addEventListener('mouseup', handleMouseUpRef.current, true);
        }
      } else if (target.closest('.image-resize-wrapper')) {
        // 如果点击了图片包装器但不是手柄，不阻止默认行为，允许文本输入
        // 不执行任何操作，让事件正常传播
      }
    };
    
    // 为所有现有图片添加包装和事件监听
    const setupImages = () => {
      const images = editor.querySelectorAll('img');
      images.forEach(img => {
        wrapImage(img);
      });
    };
    
    // 初始设置
    setupImages();
    
    // 添加鼠标按下事件监听
    editor.addEventListener('mousedown', handleMouseDown, true);
    
    // 确保编辑器始终可编辑，即使在其他事件处理之后
    const ensureEditable = () => {
      if (editor.contentEditable !== 'true') {
        editor.contentEditable = 'true';
        if (editor.contentEditable !== 'true') {
          editor.removeAttribute('contenteditable');
          editor.setAttribute('contenteditable', 'true');
        }
      }
    };
    
    // 在每次键盘输入前确保可编辑（使用捕获阶段，在其他处理器之前执行）
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      // 如果焦点在编辑器内，确保可编辑
      if (document.activeElement === editor || editor.contains(document.activeElement)) {
        ensureEditable();
        // 不再强制聚焦 - 用户已经在编辑器中输入了
      }
    };
    
    // 在每次鼠标点击前确保可编辑（但不强制聚焦）
    const handleClickGlobal = (e: MouseEvent) => {
      // 如果点击的是编辑器区域（但不是调整手柄），确保可编辑
      const target = e.target as HTMLElement;
      if (editor.contains(target) && !target.classList.contains('resize-handle') && !target.closest('.resize-handle')) {
        ensureEditable();
        // 不再强制聚焦 - 让用户点击哪里，焦点就在哪里
      }
    };
    
    // 使用捕获阶段，确保在其他事件处理器之前执行
    document.addEventListener('keydown', handleKeyDownGlobal, true);
    document.addEventListener('keypress', handleKeyDownGlobal, true);
    document.addEventListener('click', handleClickGlobal, true);
    
    // 使用 MutationObserver 监听新插入的图片
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // 如果插入的是图片包装器，确保它有正确的样式
            if (element.classList.contains('image-resize-wrapper')) {
              element.style.display = 'inline-block';
              element.style.verticalAlign = 'middle';
              element.style.position = 'relative';
              return;
            }
            // 如果插入的是图片，需要包装
            if (element.tagName === 'IMG') {
              // 延迟一下，确保图片已经插入到DOM中
              setTimeout(() => {
                const img = element as HTMLImageElement;
                // 再次检查是否已经被包装
                if (!img.parentElement?.classList.contains('image-resize-wrapper')) {
                  wrapImage(img);
                }
              }, 10);
            }
            // 检查子元素中的图片（但不包括已经在包装器中的）
            const childImages = element.querySelectorAll('img');
            childImages.forEach(img => {
              // 检查是否已经在包装器中
              if (!img.parentElement?.classList.contains('image-resize-wrapper')) {
                setTimeout(() => {
                  wrapImage(img as HTMLImageElement);
                }, 10);
              }
            });
          }
        });
      });
    });
    
    observer.observe(editor, {
      childList: true,
      subtree: true
    });
    
    return () => {
      // 清理时也要停止调整状态
      state.isResizing = false;
      state.resizeWrapper = null;
      editor.removeEventListener('mousedown', handleMouseDown, true);
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current, true);
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current, true);
      }
      // 移除全局事件监听器
      document.removeEventListener('keydown', handleKeyDownGlobal, true);
      document.removeEventListener('keypress', handleKeyDownGlobal, true);
      document.removeEventListener('click', handleClickGlobal, true);
      observer.disconnect();
    };
  }, [note, title, category, onUpdateNote]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    lastTitleRef.current = newTitle; // 更新最后的标题值
    isTitleEditingRef.current = true; // 标记正在编辑标题
    if (note) {
      // 传递当前的分组值，确保分组不会丢失
      debouncedSave(note.id, newTitle, content, category);
      // 延迟重置编辑状态，避免在保存过程中被重置
      setTimeout(() => {
        isTitleEditingRef.current = false;
      }, 1000);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    lastCategoryRef.current = newCategory; // 更新最后的分组值
    isCategoryEditingRef.current = true; // 标记正在编辑分组
    if (note && onUpdateCategory) {
      // 使用防抖保存分组
      if (categorySaveTimeoutRef.current) {
        clearTimeout(categorySaveTimeoutRef.current);
      }
      categorySaveTimeoutRef.current = setTimeout(() => {
        onUpdateCategory(note.id, newCategory);
        // 延迟重置编辑状态，避免在保存过程中被重置
        setTimeout(() => {
          isCategoryEditingRef.current = false;
        }, 1000);
      }, 500);
    }
  };

  const handleContentChange = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setContent(newContent);
      lastContentRef.current = newContent; // 更新最后的内容
      isEditingRef.current = true; // 标记正在编辑
      if (note) {
        // 传递当前的分组值，确保分组不会丢失
        debouncedSave(note.id, title, newContent, category);
      }
      // 延迟重置编辑状态，避免在保存过程中被重置
      setTimeout(() => {
        isEditingRef.current = false;
      }, 2000);
    }
  };

  const debouncedSave = (id: number, title: string, content: string, category?: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      // 传递分组值，确保分组不会丢失
      onUpdateNote(id, title, content, category);
    }, 1000);
  };

  const handleImageUpload = () => {
    if (!note) {
      alert('请先选择一个笔记或创建新笔记');
      return;
    }

    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !note) {
        document.body.removeChild(input);
        return;
      }

      // 检查文件大小（增加到10MB，因为PNG可能更大）
      if (file.size > 10 * 1024 * 1024) {
        alert('图片大小不能超过 10MB');
        document.body.removeChild(input);
        return;
      }
      
      // 检查文件类型
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
      if (!validTypes.includes(file.type)) {
        alert(`不支持的图片格式：${file.type}。支持的格式：JPG, PNG, GIF, WEBP, BMP`);
        document.body.removeChild(input);
        return;
      }
      
      console.log('准备插入图片，文件类型:', file.type, '大小:', file.size, '字节');

      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target?.result as string;
        if (!imageData) {
          alert('读取图片失败');
          document.body.removeChild(input);
          return;
        }
        
        if (!editorRef.current) {
          alert('编辑器未准备好，请稍后再试');
          document.body.removeChild(input);
          return;
        }
        
        try {
          // 确保编辑器可编辑
          editorRef.current.contentEditable = 'true';
          
          const img = document.createElement('img');
          img.src = imageData;
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.margin = '10px 0';
          img.style.display = 'block';
          
          // 获取选择范围或创建新的范围
          const selection = window.getSelection();
          let range: Range | null = null;
          
          if (selection && selection.rangeCount > 0) {
            range = selection.getRangeAt(0);
          } else {
            // 如果没有选择范围，创建一个新的范围
            range = document.createRange();
            if (editorRef.current.childNodes.length > 0) {
              // 如果编辑器有内容，将范围设置到末尾
              range.setStartAfter(editorRef.current.lastChild!);
              range.setEndAfter(editorRef.current.lastChild!);
            } else {
              // 如果编辑器为空，将范围设置到编辑器内部
              range.selectNodeContents(editorRef.current);
              range.collapse(false); // 折叠到末尾
            }
          }
          
          // 包装图片
          const wrapper = document.createElement('div');
          wrapper.className = 'image-resize-wrapper';
          // 确保包装器有正确的样式
          wrapper.style.display = 'inline-block';
          wrapper.style.verticalAlign = 'middle';
          wrapper.style.position = 'relative';
          wrapper.appendChild(img);
          
          // 创建8个调整手柄
          const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
          handles.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.setAttribute('data-direction', dir);
            wrapper.appendChild(handle);
          });
          
          // 插入包装后的图片
          if (range) {
            // 如果范围在编辑器内，直接插入
            if (editorRef.current.contains(range.commonAncestorContainer) || 
                range.commonAncestorContainer === editorRef.current) {
              range.insertNode(wrapper);
              range.collapse(false);
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            } else {
              // 如果范围不在编辑器内，追加到编辑器末尾
              editorRef.current.appendChild(wrapper);
              // 将光标移到图片后
              const newRange = document.createRange();
              newRange.setStartAfter(wrapper);
              newRange.collapse(true);
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(newRange);
              }
            }
          } else {
            // 如果没有范围，追加到编辑器末尾
            editorRef.current.appendChild(wrapper);
            // 将光标移到图片后
            const newRange = document.createRange();
            newRange.setStartAfter(wrapper);
            newRange.collapse(true);
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          }
          
          // 包装器样式已经在创建时设置，这里不需要重复设置
          
          // 先保存图片到数据库，获取图片ID
          if (note) {
            try {
              let imageId: number | null = null;
              if (mode === 'local') {
                imageId = await window.electronAPI.saveImage(imageData, note.id);
                console.log('图片已保存到本地数据库，ID:', imageId);
              } else {
                // 云端模式
                imageId = await window.electronAPI.saveImage(imageData, note.id, 'cloud');
                console.log('图片已保存到云端数据库，ID:', imageId);
              }
              
              // 如果图片保存成功，将图片标记为已保存（添加 data-image-id 属性）
              if (imageId) {
                img.setAttribute('data-image-id', imageId.toString());
                console.log('图片已标记，ID:', imageId);
              } else {
                console.warn('图片保存返回 null，但图片已插入到编辑器');
              }
            } catch (error) {
              console.error('保存图片失败:', error);
              alert(`保存图片失败：${error instanceof Error ? error.message : '未知错误'}`);
              // 即使图片保存失败，也保留图片在编辑器中
            }
          }
          
          // 立即保存一次，确保图片内容被保存（在保存图片之后）
          if (note) {
            // 等待一小段时间确保 DOM 更新完成
            setTimeout(async () => {
              if (editorRef.current) {
                const currentContent = editorRef.current.innerHTML;
                console.log(`准备保存笔记内容，长度: ${currentContent.length} 字符`);
                
                // 清除防抖，立即保存
                if (saveTimeoutRef.current) {
                  clearTimeout(saveTimeoutRef.current);
                  saveTimeoutRef.current = null;
                }
                
                try {
                  // 直接调用 onUpdateNote，不使用防抖
                  await onUpdateNote(note.id, title, currentContent, category);
                  console.log('笔记内容已保存，包含图片');
                  
                  // 触发内容变化，更新状态
                  handleContentChange();
                } catch (error) {
                  console.error('保存笔记内容失败:', error);
                  alert(`保存笔记内容失败：${error instanceof Error ? error.message : '未知错误'}`);
                }
              }
            }, 300);
          } else {
            // 如果没有笔记，至少触发内容变化
            handleContentChange();
          }
        } catch (error) {
          console.error('插入图片失败:', error);
          alert(`插入图片失败：${error instanceof Error ? error.message : '未知错误'}`);
        }
        document.body.removeChild(input);
      };
      
      reader.onerror = () => {
        alert('读取图片文件失败');
        document.body.removeChild(input);
      };
      
      reader.readAsDataURL(file);
    };

    input.oncancel = () => {
      document.body.removeChild(input);
    };
  };

  const handleFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    handleContentChange();
  };

  if (!note) {
    return (
      <div className="simple-editor empty">
        <div className="empty-editor">
          <p>选择一个笔记开始编辑，或创建新笔记</p>
        </div>
      </div>
    );
  }

  return (
    <div className="simple-editor">
      <div className="editor-header">
        <input
          ref={titleInputRef}
          type="text"
          className="title-input"
          placeholder="笔记标题"
          value={title}
          onChange={handleTitleChange}
          disabled={false}
          readOnly={false}
          onFocus={() => {
            if (titleInputRef.current) {
              titleInputRef.current.disabled = false;
              titleInputRef.current.readOnly = false;
            }
          }}
          onMouseDown={() => {
            if (titleInputRef.current) {
              titleInputRef.current.disabled = false;
              titleInputRef.current.readOnly = false;
            }
          }}
        />
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#666' }}>分组：</label>
          <input
            ref={categoryInputRef}
            type="text"
            list="categories-list"
            placeholder="输入或选择分组"
            value={category}
            onChange={handleCategoryChange}
            onFocus={() => {
              // 获得焦点时标记正在编辑，并确保可编辑
              isCategoryEditingRef.current = true;
              if (categoryInputRef.current) {
                categoryInputRef.current.disabled = false;
                categoryInputRef.current.readOnly = false;
              }
            }}
            onMouseDown={() => {
              // 鼠标按下时确保可编辑
              if (categoryInputRef.current) {
                categoryInputRef.current.disabled = false;
                categoryInputRef.current.readOnly = false;
              }
            }}
            onBlur={() => {
              // 失去焦点时立即保存
              isCategoryEditingRef.current = false; // 重置编辑状态
              if (categorySaveTimeoutRef.current) {
                clearTimeout(categorySaveTimeoutRef.current);
              }
              if (note && onUpdateCategory) {
                onUpdateCategory(note.id, category);
                lastCategoryRef.current = category; // 更新最后的分组值
              }
            }}
            style={{
              flex: 1,
              padding: '4px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px'
            }}
          />
          <datalist id="categories-list">
            {categories.map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="toolbar">
        <button onClick={() => handleFormat('bold')} title="加粗">
          <strong>B</strong>
        </button>
        <button onClick={() => handleFormat('italic')} title="斜体">
          <em>I</em>
        </button>
        <button onClick={() => handleFormat('underline')} title="下划线">
          <u>U</u>
        </button>
        <button onClick={() => handleFormat('insertUnorderedList')} title="无序列表">
          • 列表
        </button>
        <button onClick={() => handleFormat('insertOrderedList')} title="有序列表">
          1. 列表
        </button>
        <button onClick={handleImageUpload} title="插入图片">
          🖼️ 图片
        </button>
      </div>
      <div
        ref={editorRef}
        className="editor-content"
        contentEditable="true"
        suppressContentEditableWarning={true}
        onInput={(e) => {
          // 确保编辑器可编辑
          if (editorRef.current) {
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.contentEditable = 'true';
            }
            isEditingRef.current = true; // 标记正在编辑
          }
          handleContentChange();
        }}
        onKeyDown={(e) => {
          // 关键：主动请求 webContents 获得焦点（这是图片缩放能工作但编辑不行的根本原因）
          if (window.electronAPI && window.electronAPI.focusWindow) {
            window.electronAPI.focusWindow().catch(() => {});
          }
          // 确保编辑器可编辑 - 这是最关键的部分
          if (editorRef.current) {
            // 强制设置为可编辑
            editorRef.current.contentEditable = 'true';
            // 如果仍然不可编辑，可能是浏览器问题，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            // 不再强制聚焦 - 用户已经在编辑器中输入了
            isEditingRef.current = true; // 标记正在编辑
          }
          // 不要阻止事件传播，让输入事件正常处理
          // e.stopPropagation(); // 移除这行，让键盘事件正常传播
        }}
        onKeyUp={(e) => {
          // 确保编辑器可编辑
          if (editorRef.current) {
            // 强制设置为可编辑
            editorRef.current.contentEditable = 'true';
            // 如果仍然不可编辑，可能是浏览器问题，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            // 不再强制聚焦 - 用户已经在编辑器中输入了
            isEditingRef.current = true; // 标记正在编辑
          }
          handleContentChange();
        }}
        onClick={(e) => {
          // 如果是图片或调整手柄，不阻止默认行为
          const target = e.target as HTMLElement;
          if (target.tagName === 'IMG' || target.classList.contains('resize-handle') || target.closest('.image-resize-wrapper')) {
            // 图片或调整手柄点击时不阻止，让相关事件可以正常触发
            return;
          }
          // 关键：主动请求 webContents 获得焦点（这是图片缩放能工作但编辑不行的根本原因）
          if (window.electronAPI && window.electronAPI.focusWindow) {
            window.electronAPI.focusWindow().catch(() => {});
          }
          // 确保点击时获得焦点和可编辑性
          if (editorRef.current) {
            // 强制确保 contentEditable 属性存在
            editorRef.current.contentEditable = 'true';
            // 如果仍然不可编辑，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            // 立即设置焦点，不要延迟
            requestAnimationFrame(() => {
              if (editorRef.current) {
                editorRef.current.contentEditable = 'true';
                editorRef.current.focus();
                // 确保光标在编辑器内
                const selection = window.getSelection();
                if (selection && selection.rangeCount === 0) {
                  const range = document.createRange();
                  range.selectNodeContents(editorRef.current);
                  range.collapse(false); // 移到末尾
                  selection.addRange(range);
                }
              }
            });
          }
        }}
        onFocus={(e) => {
          // 确保获得焦点时编辑器可编辑
          if (editorRef.current) {
            // 强制设置为可编辑
            editorRef.current.contentEditable = 'true';
            // 如果仍然不可编辑，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            // 确保焦点在编辑器内
            if (document.activeElement !== editorRef.current) {
              // 使用 setTimeout 确保焦点设置成功
              setTimeout(() => {
                if (editorRef.current) {
                  editorRef.current.contentEditable = 'true';
                  if (document.activeElement !== editorRef.current) {
                    editorRef.current.focus();
                  }
                }
              }, 0);
            }
          }
        }}
        onMouseDown={(e) => {
          // 鼠标按下时确保编辑器可编辑并获得焦点
          e.stopPropagation();
          if (editorRef.current) {
            // 立即强制设置可编辑
            editorRef.current.contentEditable = 'true';
            // 如果仍然不可编辑，尝试重新设置
            if (editorRef.current.contentEditable !== 'true') {
              editorRef.current.removeAttribute('contenteditable');
              editorRef.current.setAttribute('contenteditable', 'true');
            }
            // 使用 requestAnimationFrame 确保在下一帧设置焦点
            requestAnimationFrame(() => {
              if (editorRef.current) {
                editorRef.current.contentEditable = 'true';
                try {
                  // 使用 preventScroll 避免滚动
                  editorRef.current.focus({ preventScroll: true });
                } catch (e) {
                  console.log('编辑器焦点设置失败:', e);
                }
              }
            });
          }
        }}
        onMouseUp={(e) => {
          // 鼠标释放时也确保编辑器可编辑并获得焦点（处理某些浏览器的问题）
          e.stopPropagation();
          if (editorRef.current && document.activeElement !== editorRef.current) {
            setTimeout(() => {
              if (editorRef.current) {
                editorRef.current.contentEditable = 'true';
                try {
                  editorRef.current.focus();
                } catch (e) {
                  // 忽略错误
                }
              }
            }, 0);
          }
        }}
        onBlur={(e) => {
          // 失去焦点时立即保存内容
          if (note) {
            const currentContent = editorRef.current ? editorRef.current.innerHTML : '';
            if (currentContent !== lastContentRef.current) {
              // 清除防抖定时器，立即保存
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
              }
              // 立即保存，不等待防抖
              onUpdateNote(note.id, title, currentContent, category);
              lastContentRef.current = currentContent;
              setContent(currentContent);
            }
          }
        }}
        onPaste={async (e) => {
          e.preventDefault();
          
          // 检查是否有图片
          const items = e.clipboardData.items;
          let hasImage = false;
          
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // 检查是否是图片类型
            if (item.type.indexOf('image') !== -1) {
              hasImage = true;
              
              // 如果没有选中笔记，提示用户
              if (!note) {
                alert('请先选择或创建一个笔记');
                return;
              }
              
              const file = item.getAsFile();
              if (!file) {
                return;
              }
              
              // 验证文件类型
              const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
              if (!validTypes.includes(file.type)) {
                alert('不支持的图片格式，仅支持 JPG、PNG、GIF、WEBP、BMP');
                return;
              }
              
              // 验证文件大小（10MB）
              const maxSize = 10 * 1024 * 1024;
              if (file.size > maxSize) {
                alert('图片大小不能超过 10MB');
                return;
              }
              
              try {
                // 读取文件并转换为 base64
                const reader = new FileReader();
                reader.onload = async (event) => {
                  if (!event.target || !event.target.result) {
                    return;
                  }
                  
                  const imageData = event.target.result as string;
                  
                  // 保存图片到数据库
                  let imageId: number | null = null;
                  if (mode === 'local') {
                    imageId = await window.electronAPI.saveImage(imageData, note.id);
                    console.log('图片已保存到本地数据库，ID:', imageId);
                  } else {
                    imageId = await window.electronAPI.saveImage(imageData, note.id, 'cloud');
                    console.log('图片已保存到云端数据库，ID:', imageId);
                  }
                  
                  // 插入图片到编辑器
                  if (editorRef.current) {
                    const selection = window.getSelection();
                    let range: Range | null = null;
                    
                    if (selection && selection.rangeCount > 0) {
                      range = selection.getRangeAt(0);
                    } else {
                      // 如果没有选择，创建一个新的 range
                      range = document.createRange();
                      if (editorRef.current.childNodes.length > 0) {
                        range.setStartAfter(editorRef.current.lastChild!);
                        range.setEndAfter(editorRef.current.lastChild!);
                      } else {
                        range.setStart(editorRef.current, 0);
                        range.setEnd(editorRef.current, 0);
                      }
                    }
                    
                    // 创建图片元素
                    const img = document.createElement('img');
                    img.src = imageData;
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                    img.style.margin = '0';
                    
                    // 包装图片
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-resize-wrapper';
                    wrapper.style.display = 'inline-block';
                    wrapper.style.verticalAlign = 'middle';
                    wrapper.style.position = 'relative';
                    wrapper.appendChild(img);
                    
                    // 创建8个调整手柄
                    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
                    handles.forEach(dir => {
                      const handle = document.createElement('div');
                      handle.className = `resize-handle ${dir}`;
                      handle.setAttribute('data-direction', dir);
                      wrapper.appendChild(handle);
                    });
                    
                    // 插入包装后的图片
                    if (range) {
                      try {
                        range.deleteContents();
                        range.insertNode(wrapper);
                        
                        // 将光标移到图片后面
                        const newRange = document.createRange();
                        newRange.setStartAfter(wrapper);
                        newRange.setEndAfter(wrapper);
                        if (selection) {
                          selection.removeAllRanges();
                          selection.addRange(newRange);
                        }
                      } catch (err) {
                        // 如果插入失败，尝试追加到末尾
                        editorRef.current.appendChild(wrapper);
                        const newRange = document.createRange();
                        newRange.setStartAfter(wrapper);
                        newRange.setEndAfter(wrapper);
                        if (selection) {
                          selection.removeAllRanges();
                          selection.addRange(newRange);
                        }
                      }
                    } else {
                      // 如果没有范围，追加到编辑器末尾
                      editorRef.current.appendChild(wrapper);
                      const newRange = document.createRange();
                      newRange.setStartAfter(wrapper);
                      newRange.setEndAfter(wrapper);
                      if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                      }
                    }
                    
                    // 保存内容
                    handleContentChange();
                    
                    // 立即保存，不等待防抖
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                      saveTimeoutRef.current = null;
                    }
                    const currentContent = editorRef.current.innerHTML;
                    await onUpdateNote(note.id, title, currentContent, category);
                    lastContentRef.current = currentContent;
                    setContent(currentContent);
                  }
                };
                
                reader.onerror = () => {
                  alert('读取图片失败');
                };
                
                reader.readAsDataURL(file);
              } catch (error) {
                console.error('粘贴图片失败:', error);
                alert(`粘贴图片失败：${error instanceof Error ? error.message : '未知错误'}`);
              }
              
              return; // 已处理图片，不再处理文本
            }
          }
          
          // 如果没有图片，处理文本粘贴
          if (!hasImage) {
            const text = e.clipboardData.getData('text/plain');
            if (editorRef.current) {
              document.execCommand('insertText', false, text);
              handleContentChange();
            }
          }
        }}
        tabIndex={0}
        data-placeholder="开始记录你的想法..."
      />
    </div>
  );
};

export default SimpleEditor;

