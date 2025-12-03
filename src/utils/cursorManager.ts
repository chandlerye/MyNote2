/**
 * 光标管理工具
 * 使用 Selection API 和 Range API 精确保存和恢复光标位置
 */

export interface CursorPosition {
  startContainer: number; // 节点在 DOM 树中的路径索引
  startOffset: number;
  endContainer: number;
  endOffset: number;
  content: string; // 保存当前内容，用于验证
}

/**
 * 获取节点在 DOM 树中的路径
 */
function getNodePath(node: Node, root: Node): number[] {
  const path: number[] = [];
  let current: Node | null = node;
  
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) break;
    
    let index = 0;
    let sibling = parent.firstChild;
    while (sibling && sibling !== current) {
      if (sibling.nodeType === Node.TEXT_NODE || sibling.nodeType === Node.ELEMENT_NODE) {
        index++;
      }
      sibling = sibling.nextSibling;
    }
    
    path.unshift(index);
    current = parent;
  }
  
  return path;
}

/**
 * 根据路径获取节点（简化版本）
 */
function getNodeByPath(path: number[], root: Node): Node | null {
  let current: Node = root;
  
  for (const index of path) {
    if (!current || !current.childNodes || current === document.body) return null;
    
    let childIndex = 0;
    let found = false;
    
    for (let i = 0; i < current.childNodes.length; i++) {
      const child = current.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.ELEMENT_NODE) {
        if (childIndex === index) {
          current = child;
          found = true;
          break;
        }
        childIndex++;
      }
    }
    
    if (!found) return null;
  }
  
  return current;
}

/**
 * 保存当前光标位置
 */
export function saveCursorPosition(editorElement: HTMLElement): CursorPosition | null {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    
    const range = selection.getRangeAt(0);
    const startPath = getNodePath(range.startContainer, editorElement);
    const endPath = getNodePath(range.endContainer, editorElement);
    
    // 将路径转换为单一数字（使用简单的编码方式）
    const startContainer = startPath.reduce((acc, val) => acc * 1000 + val, 0);
    const endContainer = endPath.reduce((acc, val) => acc * 1000 + val, 0);
    
    return {
      startContainer,
      startOffset: range.startOffset,
      endContainer,
      endOffset: range.endOffset,
      content: editorElement.innerHTML.substring(0, 100), // 保存前100个字符用于验证
    };
  } catch (error) {
    console.error('保存光标位置失败:', error);
    return null;
  }
}

/**
 * 恢复光标位置
 */
export function restoreCursorPosition(
  editorElement: HTMLElement,
  position: CursorPosition | null
): boolean {
  if (!position) return false;
  
  try {
    // 验证内容是否匹配（简单验证）
    const currentContent = editorElement.innerHTML.substring(0, 100);
    if (currentContent !== position.content) {
      // 内容已改变，尝试恢复到末尾
      return restoreCursorToEnd(editorElement);
    }
    
    // 解码路径
    const startPath: number[] = [];
    let startContainer = position.startContainer;
    while (startContainer > 0) {
      startPath.unshift(startContainer % 1000);
      startContainer = Math.floor(startContainer / 1000);
    }
    
    const endPath: number[] = [];
    let endContainer = position.endContainer;
    while (endContainer > 0) {
      endPath.unshift(endContainer % 1000);
      endContainer = Math.floor(endContainer / 1000);
    }
    
    const startNode = getNodeByPath(startPath, editorElement);
    const endNode = getNodeByPath(endPath, editorElement);
    
    if (!startNode || !endNode) {
      // 节点不存在，恢复到末尾
      return restoreCursorToEnd(editorElement);
    }
    
    const range = document.createRange();
    range.setStart(startNode, Math.min(position.startOffset, startNode.textContent?.length || 0));
    range.setEnd(endNode, Math.min(position.endOffset, endNode.textContent?.length || 0));
    
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('恢复光标位置失败:', error);
    // 失败时恢复到末尾
    return restoreCursorToEnd(editorElement);
  }
}

/**
 * 恢复光标到末尾（备用方案）
 */
function restoreCursorToEnd(editorElement: HTMLElement): boolean {
  try {
    const range = document.createRange();
    range.selectNodeContents(editorElement);
    range.collapse(false); // 折叠到末尾
    
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('恢复光标到末尾失败:', error);
    return false;
  }
}

/**
 * 确保编辑器可编辑并恢复焦点
 */
export function ensureEditorEditable(editorElement: HTMLElement): void {
  // 确保可编辑
  if (editorElement.contentEditable !== 'true') {
    editorElement.removeAttribute('contenteditable');
    editorElement.setAttribute('contenteditable', 'true');
  }
  
  // 移除禁用属性
  editorElement.removeAttribute('disabled');
  editorElement.removeAttribute('readonly');
  
  // 尝试获得焦点
  try {
    editorElement.focus();
  } catch (error) {
    // 忽略焦点错误
  }
}

