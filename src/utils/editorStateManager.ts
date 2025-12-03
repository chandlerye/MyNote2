/**
 * 编辑器状态管理器
 * 使用全局单例模式，持续监控和修复编辑器状态
 * 确保编辑器在任何情况下都保持可编辑
 */

// 全局标志：标记用户是否正在使用搜索框或其他输入框
let isUserInteractingWithInput = false;

// 设置全局标志的工具函数
export const setUserInteractingWithInput = (value: boolean) => {
  isUserInteractingWithInput = value;
};

// 检查是否应该跳过焦点管理的工具函数
export const shouldSkipFocusManagement = (): boolean => {
  if (isUserInteractingWithInput) {
    return true;
  }
  
  const activeElement = document.activeElement;
  // 检查是否在搜索框或其他输入框中
  const isInSearchInput = activeElement?.classList.contains('search-input') ||
    activeElement?.closest('.search-input') !== null ||
    activeElement?.closest('input.search-input') !== null;

  const isInTitleInput = activeElement?.classList.contains('title-input') ||
    activeElement?.closest('.title-input') !== null;

  const isInCategoryInput = activeElement?.closest('input[list="categories-list"]') !== null;

  return isInSearchInput || isInTitleInput || isInCategoryInput;
};

interface EditorState {
  element: HTMLElement | null;
  isEditable: boolean;
  hasFocus: boolean;
  lastCheckTime: number;
}

class EditorStateManager {
  private static instance: EditorStateManager;
  private editorState: EditorState = {
    element: null,
    isEditable: false,
    hasFocus: false,
    lastCheckTime: 0,
  };
  private checkInterval: NodeJS.Timeout | null = null;
  private mutationObserver: MutationObserver | null = null;
  private isRunning = false;
  private focusWindowCallback: (() => Promise<void>) | null = null;

  private constructor() {
    // 私有构造函数，确保单例
  }

  public static getInstance(): EditorStateManager {
    if (!EditorStateManager.instance) {
      EditorStateManager.instance = new EditorStateManager();
    }
    return EditorStateManager.instance;
  }

  /**
   * 设置焦点窗口回调
   */
  public setFocusWindowCallback(callback: () => Promise<void>): void {
    this.focusWindowCallback = callback;
  }

  /**
   * 注册编辑器元素
   */
  public registerEditor(element: HTMLElement): void {
    this.editorState.element = element;
    this.startMonitoring();
  }

  /**
   * 注销编辑器元素
   */
  public unregisterEditor(): void {
    this.stopMonitoring();
    this.editorState.element = null;
  }

  /**
   * 强制确保编辑器可编辑
   */
  public forceEditable(): void {
    if (!this.editorState.element) return;

    const element = this.editorState.element;
    
    // 方法1：直接设置属性
    if (element.contentEditable !== 'true') {
      element.removeAttribute('contenteditable');
      element.setAttribute('contenteditable', 'true');
    }

    // 方法2：移除所有可能阻止编辑的属性
    element.removeAttribute('disabled');
    element.removeAttribute('readonly');
    element.removeAttribute('spellcheck');
    
    // 方法3：设置样式确保可编辑
    element.style.pointerEvents = 'auto';
    element.style.userSelect = 'text';
    element.style.webkitUserSelect = 'text';
    
    // 方法4：使用 DOM 方法强制设置
    try {
      (element as any).contentEditable = 'true';
    } catch (e) {
      // 忽略错误
    }

    this.editorState.isEditable = element.contentEditable === 'true';
  }

  /**
   * 强制恢复焦点
   */
  public async forceFocus(): Promise<void> {
    if (!this.editorState.element) return;

    const element = this.editorState.element;
    const activeElement = document.activeElement;

    // 检查是否应该跳过焦点管理
    if (shouldSkipFocusManagement()) {
      return; // 不抢夺焦点
    }

    // 本地检查：检查当前焦点是否在搜索框或其他输入框中
    const isInSearchInput = activeElement?.classList.contains('search-input') ||
      activeElement?.closest('.search-input') !== null ||
      activeElement?.closest('input.search-input') !== null;

    const isInTitleInput = activeElement?.classList.contains('title-input') ||
      activeElement?.closest('.title-input') !== null;

    const isInCategoryInput = activeElement?.closest('input[list="categories-list"]') !== null;

    // 如果用户在搜索框或其他输入框中，不要抢夺焦点
    if (isInSearchInput || isInTitleInput || isInCategoryInput) {
      return; // 不抢夺焦点
    }

    // 先确保可编辑
    this.forceEditable();

    // 方法1：使用 requestAnimationFrame 确保在下一帧设置焦点
    requestAnimationFrame(async () => {
      try {
        // 先请求 Electron 窗口焦点
        if (this.focusWindowCallback) {
          await this.focusWindowCallback();
        }

        // 等待一小段时间，确保窗口焦点已获得
        await new Promise(resolve => setTimeout(resolve, 10));

        // 设置编辑器焦点
        element.focus({ preventScroll: true });
        
        // 验证焦点是否成功
        if (document.activeElement === element) {
          this.editorState.hasFocus = true;
        } else {
          // 如果失败，使用 requestIdleCallback 重试
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => {
              try {
                element.focus({ preventScroll: true });
                this.editorState.hasFocus = document.activeElement === element;
              } catch (e) {
                // 忽略错误
              }
            });
          } else {
            setTimeout(() => {
              try {
                element.focus({ preventScroll: true });
                this.editorState.hasFocus = document.activeElement === element;
              } catch (e) {
                // 忽略错误
              }
            }, 100);
          }
        }
      } catch (e) {
        console.error('强制恢复焦点失败:', e);
      }
    });
  }

  /**
   * 开始监控编辑器状态
   */
  private startMonitoring(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const element = this.editorState.element;
    if (!element) return;

    // 立即执行一次
    this.forceEditable();

    // 使用 MutationObserver 监控 contentEditable 属性变化
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'contenteditable') {
          if (element.contentEditable !== 'true') {
            console.log('检测到 contentEditable 被修改，正在修复...');
            this.forceEditable();
          }
        }
      });
    });

    this.mutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ['contenteditable', 'disabled', 'readonly'],
      subtree: false,
    });

    // 定期检查编辑器状态（每 50ms 检查一次，非常频繁）
    this.checkInterval = setInterval(() => {
      this.checkAndFix();
    }, 50);

    // 监听窗口焦点事件
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('blur', this.handleWindowBlur);
    
    // 监听编辑器焦点事件
    element.addEventListener('focus', this.handleEditorFocus);
    element.addEventListener('blur', this.handleEditorBlur);
  }

  /**
   * 停止监控
   */
  private stopMonitoring(): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);

    if (this.editorState.element) {
      this.editorState.element.removeEventListener('focus', this.handleEditorFocus);
      this.editorState.element.removeEventListener('blur', this.handleEditorBlur);
    }
  }

  /**
   * 检查并修复编辑器状态
   */
  private checkAndFix(): void {
    if (!this.editorState.element) return;

    const element = this.editorState.element;
    const now = Date.now();

    // 检查 contentEditable
    if (element.contentEditable !== 'true') {
      this.forceEditable();
      this.editorState.lastCheckTime = now;
    }

    // 检查是否应该跳过焦点管理
    if (shouldSkipFocusManagement()) {
      return; // 不抢夺焦点
    }

    // 检查焦点（如果应该可编辑但没有焦点，尝试恢复）
    const activeElement = document.activeElement;
    
    // 检查是否在搜索框或其他输入框中
    const isInSearchInput = activeElement?.classList.contains('search-input') ||
      activeElement?.closest('.search-input') !== null ||
      activeElement?.closest('input.search-input') !== null;

    const isInTitleInput = activeElement?.classList.contains('title-input') ||
      activeElement?.closest('.title-input') !== null;

    const isInCategoryInput = activeElement?.closest('input[list="categories-list"]') !== null;

    // 如果用户在搜索框或其他输入框中，不要尝试恢复编辑器焦点
    if (isInSearchInput || isInTitleInput || isInCategoryInput) {
      return; // 不抢夺焦点
    }

    if (element.contentEditable === 'true' && 
        document.activeElement !== element &&
        !element.contains(document.activeElement)) {
      // 只有在最近没有检查过焦点时才尝试恢复（避免过于频繁）
      if (now - this.editorState.lastCheckTime > 500) {
        // 使用 requestIdleCallback 在浏览器空闲时恢复焦点
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => {
            this.forceFocus();
          }, { timeout: 100 });
        } else {
          setTimeout(() => {
            this.forceFocus();
          }, 100);
        }
        this.editorState.lastCheckTime = now;
      }
    }
  }

  private handleWindowFocus = async (): Promise<void> => {
    if (this.editorState.element) {
      // 窗口获得焦点时，只确保编辑器可编辑，不强制聚焦
      // 让用户点击哪里，焦点就在哪里
      this.forceEditable();
    }
  };

  private handleWindowBlur = (): void => {
    this.editorState.hasFocus = false;
  };

  private handleEditorFocus = (): void => {
    this.editorState.hasFocus = true;
    this.forceEditable();
  };

  private handleEditorBlur = (): void => {
    this.editorState.hasFocus = false;
  };

  /**
   * 获取当前编辑器状态
   */
  public getState(): EditorState {
    return { ...this.editorState };
  }
}

export const editorStateManager = EditorStateManager.getInstance();

