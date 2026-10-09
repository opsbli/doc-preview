import type { SearchOptions, SearchResult } from '@opsbli/file-preview-core';

/**
 * DOM 全文搜索 composable（Vue 版）
 *
 * 通过 TreeWalker 遍历容器 DOM 的文本节点，用 <mark> 包裹匹配文本实现高亮，
 * 支持上一/下一个匹配导航与清除。
 *
 * 适用于所有基于 DOM 渲染文本内容的渲染器（Text / Json / Xml / Markdown / Csv 等）。
 */
export function useDomSearch(getContainer: () => HTMLElement | null) {
  const marks: HTMLElement[] = [];
  let currentIndex = -1;
  let scrollEl: HTMLElement | null = null;

  /** 清除所有搜索高亮，恢复原始 DOM */
  const clearSearch = () => {
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const text = document.createTextNode(mark.textContent || '');
      parent.replaceChild(text, mark);
    });
    marks.length = 0;
    currentIndex = -1;
    const container = getContainer();
    if (container) container.normalize();
  };

  /** 在当前匹配索引处高亮（移除其他 active）并滚动定位 */
  const highlightCurrent = () => {
    marks.forEach((mark, i) => {
      if (i === currentIndex) {
        mark.classList.add('rfp-search-active');
      } else {
        mark.classList.remove('rfp-search-active');
      }
    });

    const current = marks[currentIndex];
    if (current) {
      const scrollRoot = scrollEl || current.closest('.rfp-overflow-auto') as HTMLElement | null;
      if (scrollRoot) {
        const markRect = current.getBoundingClientRect();
        const rootRect = scrollRoot.getBoundingClientRect();
        const offsetTop = markRect.top - rootRect.top + scrollRoot.scrollTop;
        scrollRoot.scrollTo({ top: offsetTop - rootRect.height / 2, behavior: 'smooth' });
      } else {
        current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  };

  /** 执行搜索：返回匹配结果并高亮第一个匹配 */
  const search = (query: string, options?: SearchOptions): SearchResult => {
    clearSearch();
    if (!query.trim()) return { total: 0, current: -1, matches: [] };

    const container = getContainer();
    if (!container) return { total: 0, current: -1, matches: [] };

    container.normalize();

    const caseSensitive = options?.caseSensitive ?? false;
    const needle = caseSensitive ? query : query.toLowerCase();

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

        current = after ?? (document.createTextNode('') as Text);
        remainingText = afterText;
        const remSource = caseSensitive ? remainingText : remainingText.toLowerCase();
        idx = afterText ? remSource.indexOf(needle) : -1;
      }
    }

    currentIndex = marks.length > 0 ? 0 : -1;
    if (marks.length > 0) highlightCurrent();

    return {
      total: marks.length,
      current: marks.length > 0 ? 0 : -1,
      matches: marks.map((_, i) => i),
    };
  };

  /** 跳转到下一个匹配 */
  const goToNextMatch = () => {
    if (marks.length === 0) return;
    currentIndex = (currentIndex + 1) % marks.length;
    highlightCurrent();
  };

  /** 跳转到上一个匹配 */
  const goToPrevMatch = () => {
    if (marks.length === 0) return;
    currentIndex = (currentIndex - 1 + marks.length) % marks.length;
    highlightCurrent();
  };

  /** 设置滚动容器（可选） */
  const setScrollContainer = (el: HTMLElement | null) => {
    scrollEl = el;
  };

  return {
    canSearch: true,
    search,
    goToNextMatch,
    goToPrevMatch,
    clearSearch,
    setScrollContainer,
  };
}

/** 供 Vue 渲染器模板根元素使用的类型辅助 */
export type DomSearchHandle = ReturnType<typeof useDomSearch>;
