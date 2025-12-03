import React, { useState, useRef, useEffect } from 'react';

interface CategorySelectorProps {
  selectedCategory: string;
  categories: string[];
  onCategoryChange: (category: string) => void;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedCategory,
  categories,
  onCategoryChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // 使用捕获阶段，确保在其他事件处理器之前执行
      document.addEventListener('mousedown', handleClickOutside, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
      };
    }
  }, [isOpen]);

  // 处理选择
  const handleSelect = (category: string) => {
    onCategoryChange(category);
    setIsOpen(false);
    // 恢复按钮焦点，确保可以再次打开
    setTimeout(() => {
      if (buttonRef.current) {
        buttonRef.current.focus();
      }
    }, 10);
  };

  // 处理按钮点击
  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(prev => !prev);
  };

  // 处理按钮键盘事件
  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(prev => !prev);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  // 处理选项键盘事件
  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, category: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handleSelect(category);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      if (buttonRef.current) {
        buttonRef.current.focus();
      }
    }
  };

  return (
    <div className="category-selector-custom" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        onKeyDown={handleButtonKeyDown}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }}
        style={{
          width: '100%',
          padding: '6px 24px 6px 6px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '13px',
          cursor: 'pointer',
          backgroundColor: '#fff',
          textAlign: 'left',
          position: 'relative',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.stopPropagation();
        }}
        onBlur={(e) => {
          e.stopPropagation();
        }}
      >
        {selectedCategory}
        <span
          style={{
            position: 'absolute',
            right: '6px',
            top: '50%',
            fontSize: '10px',
            transition: 'transform 0.2s',
            transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
          }}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10000,
            maxHeight: '200px',
            overflowY: 'auto',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
          }}
        >
          {['全部', '未分组', ...categories].map((cat) => (
            <div
              key={cat}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSelect(cat);
              }}
              onKeyDown={(e) => handleOptionKeyDown(e, cat)}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
              }}
              tabIndex={0}
              role="option"
              aria-selected={cat === selectedCategory}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: cat === selectedCategory ? '#e8f4fd' : 'transparent',
                color: cat === selectedCategory ? '#4a90e2' : '#333',
                fontSize: '13px',
                borderBottom: '1px solid #f0f0f0',
              }}
              onMouseEnter={(e) => {
                if (cat !== selectedCategory) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f5';
                }
              }}
              onMouseLeave={(e) => {
                if (cat !== selectedCategory) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              {cat}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategorySelector;

