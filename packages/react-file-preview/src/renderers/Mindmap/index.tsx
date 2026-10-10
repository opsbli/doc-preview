import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ChevronRight, ChevronDown, Minus, Plus, Tag, StickyNote } from 'lucide-react';
import { parseXmind, countMindmapNodes } from '@opsbli/file-preview-core';
import type { MindmapNode, MindmapSheet } from '@opsbli/file-preview-core';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

interface MindmapRendererProps {
  url: string;
}

/** 收集所有非叶子节点的 id（用于「全部折叠」） */
function collectBranchIds(node: MindmapNode, id: string, out: string[]): void {
  if (node.children.length > 0) out.push(id);
  node.children.forEach((child, index) => collectBranchIds(child, `${id}-${index}`, out));
}

interface TreeNodeProps {
  node: MindmapNode;
  id: string;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}

function TreeNode({ node, id, depth, collapsed, toggle }: TreeNodeProps) {
  const t = useTranslator();
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(id);

  return (
    <li style={{ listStyle: 'none' }}>
      <div
        className="rfp-flex rfp-items-start rfp-gap-1"
        style={{
          paddingLeft: depth === 0 ? 0 : '1.1rem',
          borderLeft: depth === 0 ? 'none' : '1px solid var(--fp-line-weak)',
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(id)}
            aria-expanded={!isCollapsed}
            aria-label={node.title || t('mindmap.untitled')}
            className="rfp-flex rfp-items-center rfp-justify-center rfp-rounded-sm"
            style={{
              width: '1.25rem',
              height: '1.25rem',
              marginTop: '0.15rem',
              flex: '0 0 auto',
              color: 'var(--fp-fg-tertiary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span style={{ width: '1.25rem', flex: '0 0 auto' }} />
        )}

        <div style={{ minWidth: 0, flex: '1 1 auto', paddingBottom: '0.35rem' }}>
          <div
            style={{
              color: depth === 0 ? 'var(--fp-fg-primary)' : 'var(--fp-fg-secondary)',
              fontWeight: depth === 0 ? 600 : depth === 1 ? 500 : 400,
              fontSize: depth === 0 ? '0.95rem' : '0.875rem',
              lineHeight: 1.5,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            {node.title || t('mindmap.untitled')}
            {hasChildren && (
              <span style={{ marginLeft: '0.4rem', color: 'var(--fp-fg-muted)', fontSize: '0.75rem' }}>
                {node.children.length}
              </span>
            )}
          </div>

          {node.labels && node.labels.length > 0 && (
            <div className="rfp-flex rfp-flex-wrap rfp-items-center" style={{ gap: '0.25rem', marginTop: '0.2rem' }}>
              {node.labels.map((label) => (
                <span
                  key={label}
                  className="rfp-flex rfp-items-center"
                  style={{
                    gap: '0.2rem',
                    padding: '0.05rem 0.35rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.7rem',
                    color: 'var(--fp-fg-tertiary)',
                    background: 'var(--fp-surface-2)',
                  }}
                >
                  <Tag size={10} />
                  {label}
                </span>
              ))}
            </div>
          )}

          {node.notes && (
            <div
              className="rfp-flex rfp-items-start"
              style={{
                gap: '0.3rem',
                marginTop: '0.25rem',
                padding: '0.3rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                color: 'var(--fp-fg-tertiary)',
                background: 'var(--fp-surface-1)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <StickyNote size={12} style={{ flex: '0 0 auto', marginTop: '0.15rem' }} />
              <span>{node.notes}</span>
            </div>
          )}
        </div>
      </div>

      {hasChildren && !isCollapsed && (
        <ul style={{ margin: 0, padding: 0 }}>
          {node.children.map((child, index) => (
            <TreeNode
              key={`${id}-${index}`}
              node={child}
              id={`${id}-${index}`}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export const MindmapRenderer = forwardRef<RendererHandle, MindmapRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [sheets, setSheets] = useState<MindmapSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const parsed = await parseXmind(buffer);
        if (!isMounted) return;
        setSheets(parsed.sheets);
        setActiveSheet(0);
        setCollapsed(new Set());
      } catch (err) {
        if (!isMounted) return;
        console.error('XMind 解析错误:', err);
        const detail = err instanceof Error && err.message ? err.message : t('mindmap.load_failed');
        setError(detail);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [url, fetcher, t]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  if (error) {
    return <RendererError message={error} />;
  }

  const sheet = sheets[activeSheet];
  if (!sheet) {
    return (
      <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full rfp-text-fg-tertiary rfp-text-sm">
        {t('mindmap.empty')}
      </div>
    );
  }

  const branchIds: string[] = [];
  collectBranchIds(sheet.root, '0', branchIds);
  const totalTopics = countMindmapNodes(sheet.root);

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
        {sheets.length > 1 && (
          <div className="rfp-flex rfp-items-center rfp-gap-1 rfp-overflow-auto">
            {sheets.map((item, index) => (
              <button
                key={`${item.title}-${index}`}
                type="button"
                onClick={() => setActiveSheet(index)}
                className="rfp-rounded-sm rfp-text-xs"
                style={{
                  padding: '0.15rem 0.5rem',
                  border: '1px solid var(--fp-line-weak)',
                  cursor: 'pointer',
                  color: index === activeSheet ? 'var(--fp-fg-primary)' : 'var(--fp-fg-tertiary)',
                  background: index === activeSheet ? 'var(--fp-accent-soft)' : 'transparent',
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}

        <span className="rfp-text-xs rfp-text-fg-muted">{t('mindmap.topics', { count: totalTopics })}</span>

        <div className="rfp-flex rfp-items-center rfp-gap-1" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setCollapsed(new Set())}
            title={t('mindmap.expand_all')}
            aria-label={t('mindmap.expand_all')}
            className="rfp-flex rfp-items-center rfp-justify-center rfp-rounded-sm"
            style={{ width: '1.5rem', height: '1.5rem', border: 'none', background: 'transparent', color: 'var(--fp-fg-secondary)', cursor: 'pointer' }}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(new Set(branchIds))}
            title={t('mindmap.collapse_all')}
            aria-label={t('mindmap.collapse_all')}
            className="rfp-flex rfp-items-center rfp-justify-center rfp-rounded-sm"
            style={{ width: '1.5rem', height: '1.5rem', border: 'none', background: 'transparent', color: 'var(--fp-fg-secondary)', cursor: 'pointer' }}
          >
            <Minus size={14} />
          </button>
        </div>
      </div>

      <div className="rfp-w-full" style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '1rem 1.25rem' }}>
        <ul style={{ margin: 0, padding: 0 }}>
          <TreeNode node={sheet.root} id="0" depth={0} collapsed={collapsed} toggle={toggle} />
        </ul>
      </div>
    </div>
  );
});
