import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseDicomImage, renderDicomFrame } from '@opsbli/file-preview-core';
import type { DicomImage } from '@opsbli/file-preview-core';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

interface DcmRendererProps {
  url: string;
}

/**
 * DICOM（医学影像）渲染器
 *
 * 灰度窗宽窗位经拖拽实时调整（横向改窗宽、纵向改窗中心），多帧可翻页。
 * 支持范围与限制见 core 的 `utils/dicomParser.ts`（压缩传输语法会给出明确提示）。
 */
export const DcmRenderer = forwardRef<RendererHandle, DcmRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [image, setImage] = useState<DicomImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [windowCenter, setWindowCenter] = useState(0);
  const [windowWidth, setWindowWidth] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rgbaRef = useRef<Uint8ClampedArray | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setImage(null);
      setFrame(0);

      try {
        const response = await fetcher(url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
        if (!response.ok) {
          throw new Error(`文件加载失败 (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const parsed = parseDicomImage(buffer);
        if (!isMounted) return;
        setImage(parsed);
        setWindowCenter(parsed.windowCenter);
        setWindowWidth(parsed.windowWidth);
      } catch (err) {
        if (!isMounted) return;
        console.error('DICOM 解析错误:', err);
        const detail = err instanceof Error && err.message ? err.message : t('dcm.parse_failed');
        setError(detail);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
      rgbaRef.current = null;
    };
  }, [url, fetcher, t]);

  // 按当前窗宽窗位绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rgbaRef.current = renderDicomFrame(image, frame, windowCenter, windowWidth, rgbaRef.current ?? undefined);
    const imageData = ctx.createImageData(image.width, image.height);
    imageData.data.set(rgbaRef.current);
    ctx.putImageData(imageData, 0, 0);
  }, [image, frame, windowCenter, windowWidth]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setWindowWidth((prev) => Math.max(1, prev + dx * 2));
    setWindowCenter((prev) => prev + dy * 2);
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

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

  if (error || !image) {
    return <RendererError message={error || t('dcm.parse_failed')} />;
  }

  return (
    <div className="rfp-w-full rfp-h-full rfp-flex rfp-flex-col" style={{ minHeight: 0, background: '#000' }}>
      <div
        className="rfp-flex rfp-items-center rfp-gap-2 rfp-px-4 rfp-text-xs"
        style={{
          flex: '0 0 auto',
          height: '2rem',
          color: 'rgb(255 255 255 / 0.75)',
          borderBottom: '1px solid rgb(255 255 255 / 0.12)',
        }}
      >
        <span>{t('dcm.window_level', { center: Math.round(windowCenter), width: Math.round(windowWidth) })}</span>
        {image.meta.modality && <span>· {image.meta.modality}</span>}
        {image.meta.patientName && <span>· {image.meta.patientName}</span>}

        {image.frames > 1 && (
          <span className="rfp-flex rfp-items-center rfp-gap-1" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              disabled={frame <= 0}
              onClick={() => setFrame((prev) => Math.max(0, prev - 1))}
              className="rfp-flex rfp-items-center rfp-justify-center"
              style={{ width: '1.25rem', height: '1.25rem', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
              aria-label={t('toolbar.prev_page')}
            >
              <ChevronLeft size={13} />
            </button>
            <span>{t('dcm.frame', { current: frame + 1, total: image.frames })}</span>
            <button
              type="button"
              disabled={frame >= image.frames - 1}
              onClick={() => setFrame((prev) => Math.min(image.frames - 1, prev + 1))}
              className="rfp-flex rfp-items-center rfp-justify-center"
              style={{ width: '1.25rem', height: '1.25rem', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
              aria-label={t('toolbar.next_page')}
            >
              <ChevronRight size={13} />
            </button>
          </span>
        )}
      </div>

      <div className="rfp-flex-1 rfp-min-h-0 rfp-flex rfp-items-center rfp-justify-center" style={{ overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={t('dcm.window_level_hint')}
          style={{ maxWidth: '100%', maxHeight: '100%', cursor: 'crosshair', imageRendering: 'pixelated' }}
        />
      </div>

      <div
        className="rfp-text-xs rfp-px-4"
        style={{ flex: '0 0 auto', height: '1.5rem', lineHeight: '1.5rem', color: 'rgb(255 255 255 / 0.5)' }}
      >
        {t('dcm.window_level_hint')}
      </div>
    </div>
  );
});
