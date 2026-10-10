import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type BpmnViewer from 'bpmn-js/lib/Viewer';
import { fetchTextUtf8 } from '@opsbli/file-preview-core';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

// bpmn-js 的样式：diagram-js 布局 + bpmn 主题 + 内嵌图标字体。
// 样式随本渲染器所在 chunk 一并进入库的 style.css，无需使用方额外引入资源。
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

interface BpmnRendererProps {
  url: string;
}

export const BpmnRenderer = forwardRef<RendererHandle, BpmnRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<BpmnViewer | null>(null);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    let viewer: BpmnViewer | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [{ default: ViewerCtor }, xml] = await Promise.all([
          import('bpmn-js/lib/Viewer'),
          fetchTextUtf8(url, { fetcher }),
        ]);

        if (!isMounted || !containerRef.current) return;

        viewer = new ViewerCtor({ container: containerRef.current });
        viewerRef.current = viewer;

        await viewer.importXML(xml);

        if (!isMounted) return;

        // 自适应画布大小
        const canvas = viewer.get('canvas') as { zoom: (value: string | number) => void };
        canvas.zoom('fit-viewport');
      } catch (err) {
        if (!isMounted) return;
        console.error('BPMN 解析错误:', err);
        const detail = err instanceof Error && err.message ? err.message : t('bpmn.parse_failed');
        setError(detail);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
      viewerRef.current = null;
      if (viewer) {
        try {
          viewer.destroy();
        } catch {
          // 忽略销毁异常
        }
      }
    };
  }, [url, fetcher, t]);

  useImperativeHandle(ref, () => ({
    getToolbarGroups: () => [],
  }), []);

  if (error) {
    return <RendererError message={error} />;
  }

  return (
    <div className="rfp-w-full rfp-h-full rfp-relative" style={{ background: 'white', minHeight: 0 }}>
      <div
        ref={containerRef}
        className="rfp-w-full rfp-h-full"
        style={{ position: 'absolute', inset: 0 }}
      />
      {loading && (
        <div className="rfp-flex rfp-items-center rfp-justify-center" style={{ position: 'absolute', inset: 0 }}>
          <div className="rfp-w-12 rfp-h-12 rfp-border-4 rfp-border-line-strong rfp-border-t-spinner-head rfp-rounded-full rfp-animate-spin" />
        </div>
      )}
    </div>
  );
});
