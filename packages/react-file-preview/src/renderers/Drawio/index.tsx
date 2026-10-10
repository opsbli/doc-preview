import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Graph, ModelXmlSerializer } from '@maxgraph/core';
import '@maxgraph/core/css/common.css';
import { fetchTextUtf8, parseDrawio } from '@opsbli/file-preview-core';
import type { DrawioDiagram } from '@opsbli/file-preview-core';
import { Maximize } from 'lucide-react';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

interface DrawioRendererProps {
  url: string;
}

/**
 * drawio（mxGraph）渲染器
 *
 * 只读查看：关闭编辑与选择，加载后自动适应容器；多页时提供页签切换。
 * 使用 `@maxgraph/core` 的 `ModelXmlSerializer` 导入 mxGraphModel XML（其内部已注册 model codec）。
 */
export const DrawioRenderer = forwardRef<RendererHandle, DrawioRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<DrawioDiagram[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  // 加载并解析
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      setDiagrams([]);
      try {
        const text = await fetchTextUtf8(url, { fetcher, signal: controller.signal });
        const parsed = await parseDrawio(text);
        setDiagrams(parsed.diagrams);
        setActiveIndex(0);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('drawio 解析错误:', err);
        const detail = err instanceof Error && err.message ? err.message : t('drawio.parse_failed');
        setError(detail);
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [url, fetcher, t]);

  /** 让图形适应容器 */
  const fit = useCallback(() => {
    const graph = graphRef.current;
    const container = containerRef.current;
    if (!graph || !container) return;

    const bounds = graph.view.getGraphBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    const pad = 16;
    const scale = Math.min(
      (container.clientWidth - pad * 2) / bounds.width,
      (container.clientHeight - pad * 2) / bounds.height,
      1,
    );
    const safeScale = scale > 0.01 ? scale : 1;
    graph.view.scaleAndTranslate(safeScale, -bounds.x * safeScale + pad, -bounds.y * safeScale + pad);
  }, []);

  // 渲染当前页
  useEffect(() => {
    const container = containerRef.current;
    const diagram = diagrams[activeIndex];
    if (!container || !diagram) return;

    container.innerHTML = '';
    let graph: Graph | null = null;

    try {
      graph = new Graph(container);
      graph.setEnabled(false);
      const serializer = new ModelXmlSerializer(graph.getDataModel());
      serializer.import(diagram.xml);
      graph.view.validate();
      graphRef.current = graph;
      fit();
    } catch (err) {
      console.error('drawio 渲染错误:', err);
      const detail = err instanceof Error && err.message ? err.message : t('drawio.parse_failed');
      setError(detail);
    }

    return () => {
      graphRef.current = null;
      if (graph) {
        try {
          graph.destroy();
        } catch {
          // 忽略销毁异常
        }
      }
      container.innerHTML = '';
    };
  }, [diagrams, activeIndex, fit, t]);

  // 容器尺寸变化时重新适应
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timer: number | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(fit, 150);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [fit]);

  useImperativeHandle(ref, () => ({
    getToolbarGroups: () => [],
  }), []);

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

  return (
    <div className="rfp-w-full rfp-h-full rfp-flex rfp-flex-col" style={{ minHeight: 0 }}>
      <div
        className="rfp-flex rfp-items-center rfp-gap-2 rfp-px-4"
        style={{
          flex: '0 0 auto',
          height: '2.25rem',
          borderBottom: '1px solid var(--fp-line-weak)',
          background: 'var(--fp-surface-1)',
        }}
      >
        {diagrams.length > 1 && (
          <div className="rfp-flex rfp-items-center rfp-gap-1 rfp-overflow-auto">
            {diagrams.map((diagram, index) => (
              <button
                key={`${diagram.name}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="rfp-rounded-sm rfp-text-xs"
                style={{
                  padding: '0.15rem 0.5rem',
                  border: '1px solid var(--fp-line-weak)',
                  cursor: 'pointer',
                  color: index === activeIndex ? 'var(--fp-fg-primary)' : 'var(--fp-fg-tertiary)',
                  background: index === activeIndex ? 'var(--fp-accent-soft)' : 'transparent',
                }}
              >
                {diagram.name || `Page ${index + 1}`}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={fit}
          title={t('toolbar.fit_to_window')}
          aria-label={t('toolbar.fit_to_window')}
          className="rfp-flex rfp-items-center rfp-justify-center rfp-rounded-sm"
          style={{
            marginLeft: 'auto',
            width: '1.5rem',
            height: '1.5rem',
            border: 'none',
            background: 'transparent',
            color: 'var(--fp-fg-secondary)',
            cursor: 'pointer',
          }}
        >
          <Maximize size={14} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="rfp-w-full"
        style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', background: '#fff' }}
      />
    </div>
  );
});
