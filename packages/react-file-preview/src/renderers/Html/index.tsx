import { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Code, Eye } from 'lucide-react';
import { fetchTextUtf8, prepareHtmlForSandbox } from '@opsbli/file-preview-core';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { useShikiHighlight } from '../../hooks/useShikiHighlight';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';
import type { ToolbarGroup } from '../toolbar.types';

interface HtmlRendererProps {
  url: string;
}

/**
 * HTML 渲染器
 *
 * 预览模式使用 `<iframe sandbox="">` 承载文档：
 * - 不带 allow-scripts → 页面内脚本一律不执行
 * - 不带 allow-same-origin → 与宿主页面不同源，无法访问宿主 storage/cookie
 * 因此这是「静态安全预览」：依赖脚本才能渲染的页面不会完整还原。
 */
export const HtmlRenderer = forwardRef<RendererHandle, HtmlRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const rootRef = useRef<HTMLDivElement>(null);

  const { html: sourceHtml } = useShikiHighlight(viewMode === 'source' ? content : '', 'html');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const text = await fetchTextUtf8(url, { fetcher, signal: controller.signal });
        setContent(text);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error(err);
        setError(t('html.load_failed'));
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [url, fetcher, t]);

  const previewHtml = useMemo(() => prepareHtmlForSandbox(content), [content]);

  // 事件发射器：通知主组件工具栏状态变化
  const listenersRef = useRef<Set<() => void>>(new Set());
  const notifyToolbarChange = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    notifyToolbarChange();
  }, [viewMode, notifyToolbarChange]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'preview' ? 'source' : 'preview'));
  }, []);

  const getToolbarGroups = useCallback((): ToolbarGroup[] => [
    {
      items: [
        {
          type: 'button',
          icon: viewMode === 'preview' ? <Code className="rfp-w-4 rfp-h-4" /> : <Eye className="rfp-w-4 rfp-h-4" />,
          tooltip: viewMode === 'preview' ? t('toolbar.source') : t('toolbar.preview'),
          action: toggleViewMode,
          active: viewMode === 'source',
        },
      ],
    },
  ], [viewMode, t, toggleViewMode]);

  useImperativeHandle(ref, () => ({
    getToolbarGroups,
    onToolbarChange: (listener: () => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
  }), [getToolbarGroups]);

  if (loading) {
    return (
      <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full">
        <div className="rfp-w-12 rfp-h-12 rfp-border-4 rfp-border-line-strong rfp-border-t-spinner-head rfp-rounded-full rfp-animate-spin" />
      </div>
    );
  }

  if (error) {
    return <RendererError message={error} />;
  }

  if (viewMode === 'source') {
    return (
      <div ref={rootRef} className="rfp-w-full rfp-h-full rfp-overflow-auto rfp-bg-code-bg">
        {sourceHtml ? (
          <div className="rfp-shiki-wrapper with-line-numbers" dangerouslySetInnerHTML={{ __html: sourceHtml }} />
        ) : (
          <pre className="rfp-p-6 rfp-text-fg-primary rfp-font-mono rfp-text-sm rfp-whitespace-pre-wrap rfp-break-words">
            {content}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rfp-w-full rfp-h-full">
      <iframe
        title={t('html.preview_frame_title')}
        sandbox=""
        srcDoc={previewHtml}
        className="rfp-w-full rfp-h-full rfp-border-0"
        style={{ background: '#fff' }}
      />
    </div>
  );
});
