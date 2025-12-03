import React from 'react';
import './ModeSelector.css';

interface ModeSelectorProps {
  mode: 'local' | 'cloud';
  onModeChange: (mode: 'local' | 'cloud') => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ mode, onModeChange }) => {
  const handleModeChange = (newMode: 'local' | 'cloud', e: React.MouseEvent<HTMLButtonElement>) => {
    // 关键：立即移除按钮焦点，防止按钮占用焦点
    e.currentTarget.blur();
    
    // 使用 setTimeout 确保按钮的 blur 事件完成后再切换模式
    setTimeout(() => {
      onModeChange(newMode);
      
      // 模式切换后，立即尝试恢复编辑器焦点
      setTimeout(() => {
        // 确保窗口获得焦点
        window.focus();
        
        // 触发 focus 事件
        window.dispatchEvent(new Event('focus'));
        
        // 尝试将焦点转移到编辑器
        const editorElement = document.querySelector('.editor-content') as HTMLElement;
        if (editorElement) {
          editorElement.contentEditable = 'true';
          if (editorElement.contentEditable !== 'true') {
            editorElement.removeAttribute('contenteditable');
            editorElement.setAttribute('contenteditable', 'true');
          }
          
          // 使用 requestAnimationFrame 确保在正确的渲染周期设置焦点
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                editorElement.focus();
                // 设置光标位置到末尾
                const selection = window.getSelection();
                if (selection && editorElement) {
                  const range = document.createRange();
                  range.selectNodeContents(editorElement);
                  range.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              } catch (e) {
                // 忽略错误
              }
            });
          });
        }
      }, 50);
    }, 0);
  };

  return (
    <div className="mode-selector">
      <button
        className={`mode-btn ${mode === 'local' ? 'active' : ''}`}
        onClick={(e) => handleModeChange('local', e)}
        onMouseDown={(e) => {
          // 阻止 mousedown 事件获得焦点
          e.preventDefault();
        }}
      >
        本地模式
      </button>
      <button
        className={`mode-btn ${mode === 'cloud' ? 'active' : ''}`}
        onClick={(e) => handleModeChange('cloud', e)}
        onMouseDown={(e) => {
          // 阻止 mousedown 事件获得焦点
          e.preventDefault();
        }}
      >
        云端模式
      </button>
    </div>
  );
};

export default ModeSelector;

