import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { RTFJS } from 'rtf.js';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

interface RtfRendererProps {
  url: string;
}

/**
 * RTF 渲染器（基于 rtf.js）
 *
 * rtf.js 会把 RTF 解析为一组 HTMLElement（返回值即待插入的节点数组），
 * 这里只负责取文件、调用解析/渲染并把结果挂到容器上。
 */
export const RtfRenderer = forwardRef<RendererHandle, RtfRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetcher(url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
        if (!response.ok) {
          throw new Error(`文件加载失败 (${response.status})`);
        }
        const buffer = await response.arrayBuffer();

        RTFJS.loggingEnabled(false);
        const document = new RTFJS.Document(buffer, {});
        const elements = await document.render();

        if (!isMounted || !containerRef.current) return;
        containerRef.current.replaceChildren(...elements);
      } catch (err) {
        if (!isMounted) return;
        console.error('RTF 渲染错误:', err);
        setError(t('rtf.parse_failed'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [url, fetcher, t]);

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
    <div className="rfp-w-full rfp-h-full rfp-overflow-auto" style={{ background: '#fff' }}>
      <div ref={containerRef} style={{ padding: 'clamp(12px, 3vw, 24px)' }} />
    </div>
  );
});
