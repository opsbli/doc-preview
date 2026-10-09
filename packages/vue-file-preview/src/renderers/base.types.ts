import type { ToolbarGroup } from './toolbar.types';
import type { SearchOptions, SearchResult } from '@opsbli/file-preview-core';

/**
 * 渲染器统一接口
 * 所有渲染器通过 defineExpose 暴露此接口，让主组件获取工具栏配置
 */
export interface RendererHandle {
  getToolbarGroups: () => ToolbarGroup[];
  onToolbarChange?: (listener: () => void) => (() => void);

  /** 声明是否支持全文搜索 */
  canSearch?: () => boolean;

  /** 执行全文搜索 */
  search?: (query: string, options?: SearchOptions) => SearchResult | Promise<SearchResult>;

  /** 跳转到下一个匹配 */
  goToNextMatch?: () => void;

  /** 跳转到上一个匹配 */
  goToPrevMatch?: () => void;

  /** 清除搜索高亮 */
  clearSearch?: () => void;
}

/**
 * 轻量级工具栏事件发射器
 * 用于渲染器内部管理工具栏变化事件的订阅和通知
 */
export class ToolbarEventEmitter {
  private listeners = new Set<() => void>();

  /**
   * 订阅工具栏变化事件
   * @param listener - 事件回调函数
   * @returns 取消订阅的函数
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有订阅者工具栏已变化
   */
  notify(): void {
    this.listeners.forEach(fn => fn());
  }
}
