import type { ToolbarGroup } from './toolbar.types';
import type { SearchOptions, SearchResult } from '@opsbli/file-preview-core';

/**
 * 渲染器统一接口
 *
 * 所有渲染器都应通过 forwardRef 暴露此接口，使主组件能够：
 * 1. 获取工具栏配置（必需）
 * 2. 订阅工具栏状态变化（可选，用于实时更新）
 * 3. 声明搜索能力（可选）
 * 4. 执行全文搜索（可选）
 */
export interface RendererHandle {
  /**
   * 获取当前工具栏配置
   */
  getToolbarGroups: () => ToolbarGroup[];

  /**
   * 订阅工具栏状态变化事件（可选）
   */
  onToolbarChange?: (listener: () => void) => (() => void);

  /**
   * 声明是否支持全文搜索
   */
  canSearch?: () => boolean;

  /**
   * 执行全文搜索
   * @returns 搜索结果
   */
  search?: (query: string, options?: SearchOptions) => SearchResult | Promise<SearchResult>;

  /**
   * 跳转到下一个匹配
   */
  goToNextMatch?: () => void;

  /**
   * 跳转到上一个匹配
   */
  goToPrevMatch?: () => void;

  /**
   * 清除搜索高亮
   */
  clearSearch?: () => void;
}
