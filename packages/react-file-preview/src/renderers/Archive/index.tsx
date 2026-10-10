import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, forwardRef, useImperativeHandle } from 'react';
import { Folder, File as FileIcon } from 'lucide-react';
import { loadArchive, inferMimeType } from '@opsbli/file-preview-core';
import type { ArchiveHandle, ZipEntryInfo } from '@opsbli/file-preview-core';
import { RendererError } from '../RendererError';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import type { RendererHandle } from '../base.types';

// 懒加载 FilePreviewContent 以打破循环依赖
const LazyFilePreviewContent = lazy(() =>
  import('../../FilePreviewContent').then((m) => ({ default: m.FilePreviewContent })),
);

interface ArchiveRendererProps {
  url: string;
  /** 原始文件名（用于判断 tar / tgz / gz / 7z / rar） */
  fileName?: string;
}

interface SelectedEntry {
  path: string;
  name: string;
  blobUrl: string;
}

/** 单次渲染的最大条目数，避免超大归档卡顿 */
const MAX_ROWS = 2000;

function formatSize(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** 按路径排序，并把路径深度换算成缩进层级 */
function buildRows(entries: ZipEntryInfo[]): { entry: ZipEntryInfo; depth: number }[] {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => {
      const segments = entry.path.replace(/\/$/, '').split('/').filter(Boolean);
      return { entry, depth: Math.max(0, segments.length - 1) };
    });
}

export const ArchiveRenderer = forwardRef<RendererHandle, ArchiveRendererProps>(({ url, fileName }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [archive, setArchive] = useState<ArchiveHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedEntry | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  /** 释放上一个条目预览的 blob URL */
  const releaseBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setArchive(null);
      setSelected(null);

      try {
        const response = await fetcher(url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
        if (!response.ok) {
          throw new Error(`文件加载失败 (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const handle = await loadArchive(buffer, fileName);
        if (!isMounted) return;
        setArchive(handle);
      } catch (err) {
        if (!isMounted) return;
        console.error('压缩包解析错误:', err);
        setError(err instanceof Error && err.message ? err.message : t('archive.parse_failed'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [url, fileName, fetcher, t]);

  useEffect(() => {
    return () => releaseBlobUrl();
  }, [releaseBlobUrl]);

  const rows = useMemo(() => (archive ? buildRows(archive.entries) : []), [archive]);
  const visibleRows = useMemo(() => rows.slice(0, MAX_ROWS), [rows]);

  const handleSelect = useCallback(
    async (entry: ZipEntryInfo) => {
      if (!archive || entry.isDir) return;

      releaseBlobUrl();
      setSelected(null);
      setPreviewError(null);
      setPreviewLoading(true);

      try {
        const mime = inferMimeType(entry.name);
        const blob = await archive.readBlob(entry.path, mime !== 'application/octet-stream' ? mime : undefined);
        const blobUrl = URL.createObjectURL(blob);
        blobUrlRef.current = blobUrl;
        setSelected({ path: entry.path, name: entry.name, blobUrl });
      } catch (err) {
        console.error('压缩包条目读取失败:', err);
        setPreviewError(t('archive.load_failed'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [archive, releaseBlobUrl, t],
  );

  const previewFiles = useMemo(() => {
    if (!selected) return [];
    return [{ name: selected.name, url: selected.blobUrl, type: inferMimeType(selected.name) }];
  }, [selected]);

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

  if (error || !archive) {
    return <RendererError message={error || t('archive.parse_failed')} />;
  }

  if (rows.length === 0) {
    return (
      <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full rfp-text-fg-muted rfp-text-sm">
        {t('archive.empty')}
      </div>
    );
  }

  return (
    <div className="rfp-flex rfp-w-full rfp-h-full" style={{ minHeight: 0 }}>
      {/* 左：条目列表 */}
      <div
        className="rfp-flex-shrink-0 rfp-overflow-auto"
        style={{ width: '17rem', borderRight: '1px solid var(--fp-line-weak)' }}
      >
        <ul style={{ margin: 0, padding: '0.5rem 0', listStyle: 'none' }}>
          {visibleRows.map(({ entry, depth }) => {
            const isSelected = selected?.path === entry.path;
            return (
              <li key={entry.path}>
                <button
                  type="button"
                  disabled={entry.isDir}
                  onClick={() => handleSelect(entry)}
                  title={entry.path}
                  className="rfp-flex rfp-items-center rfp-w-full rfp-gap-1 rfp-text-xs"
                  style={{
                    padding: '0.25rem 0.5rem',
                    paddingLeft: `${0.5 + depth * 0.9}rem`,
                    textAlign: 'left',
                    border: 'none',
                    background: isSelected ? 'var(--fp-accent-soft)' : 'transparent',
                    color: entry.isDir ? 'var(--fp-fg-primary)' : 'var(--fp-fg-secondary)',
                    fontWeight: entry.isDir ? 600 : 400,
                    cursor: entry.isDir ? 'default' : 'pointer',
                  }}
                >
                  {entry.isDir ? <Folder size={13} /> : <FileIcon size={13} />}
                  <span
                    style={{
                      flex: '1 1 auto',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.name}
                  </span>
                  {!entry.isDir && (
                    <span style={{ flex: '0 0 auto', color: 'var(--fp-fg-muted)', fontSize: '0.7rem' }}>
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {rows.length > MAX_ROWS && (
          <p className="rfp-text-xs rfp-text-fg-muted" style={{ padding: '0 0.5rem 0.5rem' }}>
            {t('archive.truncated', { count: MAX_ROWS })}
          </p>
        )}
      </div>

      {/* 右：内嵌预览 */}
      <div className="rfp-flex-1 rfp-min-w-0 rfp-h-full rfp-flex rfp-flex-col">
        {!selected && !previewLoading && (
          <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full rfp-text-fg-muted rfp-text-sm">
            {previewError || t('archive.select_hint')}
          </div>
        )}

        {previewLoading && (
          <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full">
            <div className="rfp-w-8 rfp-h-8 rfp-border-4 rfp-border-line-strong rfp-border-t-spinner-head rfp-rounded-full rfp-animate-spin" />
          </div>
        )}

        {selected && !previewLoading && (
          <div className="rfp-flex-1 rfp-min-h-0 rfp-overflow-hidden rfp-flex">
            <Suspense
              fallback={
                <div className="rfp-flex-1 rfp-flex rfp-items-center rfp-justify-center">
                  <div className="rfp-w-8 rfp-h-8 rfp-border-4 rfp-border-line-strong rfp-border-t-spinner-head rfp-rounded-full rfp-animate-spin" />
                </div>
              }
            >
              <LazyFilePreviewContent mode="embed" files={previewFiles} currentIndex={0} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
});
