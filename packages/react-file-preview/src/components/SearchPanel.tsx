import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react';
import type { Translator } from '@opsbli/file-preview-core';

interface SearchPanelProps {
  t: Translator;
  onClose: () => void;
  onSearch: (query: string, options: { caseSensitive: boolean }) => void;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  matchCount: number;
  totalCount: number;
}

/**
 * 全文搜索面板
 * 固定在工具栏下方，包含输入框、翻页按钮、匹配计数、大小写切换、关闭按钮
 */
export function SearchPanel({
  t,
  onClose,
  onSearch,
  onPrevMatch,
  onNextMatch,
  matchCount,
  totalCount,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onSearch(val, { caseSensitive });
    }, 300);
  }, [caseSensitive, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        onSearch(query, { caseSensitive });
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onPrevMatch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNextMatch();
      }
    },
    [query, caseSensitive, onSearch, onPrevMatch, onNextMatch, onClose],
  );

  const displayCount = totalCount > 0 ? `${matchCount + 1} / ${totalCount}` : t('search.no_results');

  return (
    <div className="rfp-flex rfp-items-center rfp-gap-2 rfp-px-3 md:rfp-px-5 rfp-py-1.5 rfp-border-b rfp-border-line-weak rfp-bg-surface-toolbar">
      {/* 输入框 */}
      <div className="rfp-flex rfp-items-center rfp-gap-1 rfp-flex-1 rfp-min-w-0 rfp-max-w-sm rfp-px-2 rfp-py-1 rfp-rounded-md rfp-border rfp-border-line rfp-bg-surface-input focus-within:rfp-border-fg-primary">
        <Search className="rfp-w-3.5 rfp-h-3.5 rfp-text-fg-muted rfp-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="rfp-flex-1 rfp-min-w-0 rfp-text-xs rfp-bg-transparent rfp-text-fg-primary rfp-outline-none rfp-placeholder:text-fg-muted"
        />
      </div>

      {/* 匹配计数 */}
      <span className="rfp-text-xs rfp-text-fg-muted rfp-tabular-nums rfp-shrink-0">
        {displayCount}
      </span>

      {/* 翻页按钮 */}
      <button
        onClick={onPrevMatch}
        disabled={totalCount === 0}
        className="rfp-p-1 rfp-text-fg-muted hover:rfp-text-fg-primary rfp-transition-colors rfp-disabled:text-fg-disabled rfp-disabled:cursor-not-allowed"
        title={t('search.prev_match')}
      >
        <ChevronUp className="rfp-w-4 rfp-h-4" />
      </button>
      <button
        onClick={onNextMatch}
        disabled={totalCount === 0}
        className="rfp-p-1 rfp-text-fg-muted hover:rfp-text-fg-primary rfp-transition-colors rfp-disabled:text-fg-disabled rfp-disabled:cursor-not-allowed"
        title={t('search.next_match')}
      >
        <ChevronDown className="rfp-w-4 rfp-h-4" />
      </button>

      {/* 大小写切换 */}
      <button
        onClick={() => {
          setCaseSensitive((v) => !v);
          if (query) {
            onSearch(query, { caseSensitive: !caseSensitive });
          }
        }}
        className={`rfp-p-1 rfp-transition-colors ${
          caseSensitive ? 'rfp-text-fg-primary' : 'rfp-text-fg-muted hover:rfp-text-fg-primary'
        }`}
        title={t('search.case_sensitive')}
      >
        <CaseSensitive className="rfp-w-4 rfp-h-4" />
      </button>

      {/* 关闭 */}
      <button
        onClick={onClose}
        className="rfp-p-1 rfp-text-fg-muted hover:rfp-text-fg-primary rfp-transition-colors"
        title={t('search.close')}
      >
        <X className="rfp-w-4 rfp-h-4" />
      </button>
    </div>
  );
}
