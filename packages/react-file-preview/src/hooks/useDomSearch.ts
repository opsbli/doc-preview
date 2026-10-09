import { useCallback, useMemo, useRef } from 'react';
import type { SearchOptions, SearchResult } from '@opsbli/file-preview-core';

/**
 * DOM 全文搜索 hook（框架无关逻辑，React 版）
 *
 * 通过 TreeWalker 遍历容器 DOM 的文本节点，用 <mark> 包裹匹配文本实现高亮，
 * 支持上一/下一个匹配导航与清除。
 *
 * 适用于所有基于 DOM 渲染文本内容的渲染器（Text / Json / Xml / Markdown / Csv 等）。
 */
export function useDomSearch(containerRef: React.RefObject<HTMLElement | null>) {
  const marksRef = useRef<HTMLElement[]>([]);
  const currentIndexRef = useRef(-1);
  const scrollRef = useRef<HTMLElement | null>(null);

  /** 清除所有搜索高亮，恢复原始 DOM */
  const clearSearch = useCallback(() => {
    marksRef.current.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent || '');
      parent.replaceChild(text, mark);
    });
    marksRef.current = [];
    currentIndexRef.current = -1;
    // 合并相邻文本节点，恢复原始结构
    const container = containerRef.current;
    if (container) container.normalize();
  }, [containerRef]);

  /** 在当前匹配索引处高亮（移除其他 active）并滚动定位 */
  const highlightCurrent = useCallback(() => {
    marksRef.current.forEach((mark, i) => {
      if (i === currentIndexRef.current) {
        mark.classList.add('rfp-search-active');
      } else {
        mark.classList.remove('rfp-search-active');
      }
    });

    const current = marksRef.current[currentIndexRef.current];
    if (current) {
      const scrollRoot = scrollRef.current || current.closest('.rfp-overflow-auto') as HTMLElement | null;
      if (scrollRoot) {
        const markRect = current.getBoundingClientRect();
        const rootRect = scrollRoot.getBoundingClientRect();
        const offsetTop = markRect.top - rootRect.top + scrollRoot.scrollTop;
        scrollRoot.scrollTo({ top: offsetTop - rootRect.height / 2, behavior: 'smooth' });
      } else {
        current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, []);

  /** 执行搜索：返回匹配结果并高亮第一个匹配 */
  const search = useCallback((query: string, options?: SearchOptions): SearchResult => {
    clearSearch();
    if (!query.trim()) return { total: 0, current: -1, matches: [] };

    const container = containerRef.current;
    if (!container) return { total: 0, current: -1, matches: [] };

    // 合并相邻文本节点（如 shiki 高亮 split 出的片段），保证跨节点连续文本可匹配
    container.normalize();

    const caseSensitive = options?.caseSensitive ?? false;
    const needle = caseSensitive ? query : query.toLowerCase();
    const marks: HTMLElement[] = [];

    // 遍历所有文本节点，逐节点 split 包裹 <mark>
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const fullText = node.textContent || '';
      if (!fullText) continue;
      const source = caseSensitive ? fullText : fullText.toLowerCase();
      let idx = source.indexOf(needle);
      if (idx === -1) continue;

      const parent = node.parentNode;
      if (!parent) continue;

      // 逐段 split：before → mark(match) → after，after 继续扫描
      let current = node;
      let remainingText = fullText;
      while (idx !== -1) {
        const matchText = remainingText.substring(idx, idx + query.length);
        const beforeText = remainingText.substring(0, idx);
        const afterText = remainingText.substring(idx + query.length);

        const before = beforeText ? document.createTextNode(beforeText) : null;
        const mark = document.createElement('mark');
        mark.className = 'rfp-search-mark';
        mark.textContent = matchText;
        const after = afterText ? document.createTextNode(afterText) : null;

        if (before) {
          parent.replaceChild(before, current);
          parent.insertBefore(mark, before.nextSibling);
        } else {
          parent.replaceChild(mark, current);
        }
        if (after) {
          parent.insertBefore(after, mark.nextSibling);
        }
        marks.push(mark);

        // 继续在剩余文本中扫描
        current = after ?? (document.createTextNode('') as Text);
        remainingText = afterText;
        const remSource = caseSensitive ? remainingText : remainingText.toLowerCase();
        idx = afterText ? remSource.indexOf(needle) : -1;
      }
    }

    marksRef.current = marks;
    currentIndexRef.current = marks.length > 0 ? 0 : -1;
    if (marks.length > 0) highlightCurrent();

    return {
      total: marks.length,
      current: marks.length > 0 ? 0 : -1,
      matches: marks.map((_, i) => i),
    };
  }, [clearSearch, containerRef, highlightCurrent]);

  /** 跳转到下一个匹配 */
  const goToNextMatch = useCallback(() => {
    const total = marksRef.current.length;
    if (total === 0) return;
    currentIndexRef.current = (currentIndexRef.current + 1) % total;
    highlightCurrent();
  }, [highlightCurrent]);

  /** 跳转到上一个匹配 */
  const goToPrevMatch = useCallback(() => {
    const total = marksRef.current.length;
    if (total === 0) return;
    currentIndexRef.current = (currentIndexRef.current - 1 + total) % total;
    highlightCurrent();
  }, [highlightCurrent]);

  /** 设置滚动容器（可选，用于精确滚动定位） */
  const setScrollContainer = useCallback((el: HTMLElement | null) => {
    scrollRef.current = el;
  }, []);

  // 返回 useMemo 稳定对象：避免每次渲染新建引用导致 useImperativeHandle 依赖抖动 → 父组件 callback ref 触发无限循环
  return useMemo(() => ({
    canSearch: true,
    search,
    goToNextMatch,
    goToPrevMatch,
    clearSearch,
    setScrollContainer,
  }), [search, goToNextMatch, goToPrevMatch, clearSearch, setScrollContainer]);
}
