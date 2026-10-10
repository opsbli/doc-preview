import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { User, Users, Paperclip, Calendar, Mail, Hash, Tag } from 'lucide-react';
import { parseEml } from '@opsbli/file-preview-core';
import type { ParsedEml } from '@opsbli/file-preview-core';
import { useTranslator } from '../../i18n/LocaleContext';
import { useFetcher } from '../../RequestContext';
import { RendererError } from '../RendererError';
import type { RendererHandle } from '../base.types';

interface EmlRendererProps {
  url: string;
}

const labelStyle: React.CSSProperties = {
  flexShrink: 0,
  color: '#6b7280',
  fontWeight: 500,
  marginRight: '8px',
  whiteSpace: 'nowrap',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '6px 0',
};

const iconWrapStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  height: '1.4em',
};

const iconStyle: React.CSSProperties = {
  flexShrink: 0,
  color: '#9ca3af',
};

const valueStyle: React.CSSProperties = {
  color: '#111827',
  wordBreak: 'break-word',
  flex: 1,
};

/** 归一化 Content-ID：去掉尖括号与 cid: 前缀，便于与正文引用匹配 */
function normalizeContentId(contentId: string): string {
  return contentId.replace(/^cid:/i, '').replace(/^</, '').replace(/>$/, '').trim();
}

function formatAddress(name: string | undefined, address: string | undefined): string {
  if (name && address && name !== address) return `${name} <${address}>`;
  return name || address || '';
}

function formatAddressList(list: { name?: string; address?: string }[]): string {
  return list.map((item) => formatAddress(item.name, item.address)).filter(Boolean).join('; ');
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

function formatSize(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export const EmlRenderer = forwardRef<RendererHandle, EmlRendererProps>(({ url }, ref) => {
  const t = useTranslator();
  const fetcher = useFetcher();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<ParsedEml | null>(null);

  useEffect(() => {
    if (!url) return;

    let isMounted = true;
    const loadEml = async () => {
      setLoading(true);
      setError(null);
      setEmail(null);

      try {
        const response = await fetcher(url);
        if (!response.ok) {
          throw new Error(`文件加载失败 (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const parsed = await parseEml(buffer);
        if (!isMounted) return;
        setEmail(parsed);
      } catch (err) {
        if (!isMounted) return;
        console.error('EML 解析错误:', err);
        setError(t('eml.parse_failed'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadEml();
    return () => {
      isMounted = false;
    };
  }, [url, fetcher, t]);

  useImperativeHandle(ref, () => ({
    getToolbarGroups: () => [],
  }), []);

  // 内联图片（Content-ID 引用）→ blob URL，并在 HTML 中替换 cid: 引用
  const { bodyHtml, inlineUrls } = useMemo(() => {
    if (!email) return { bodyHtml: null as string | null, inlineUrls: [] as string[] };

    const urls: string[] = [];
    const idMap = new Map<string, string>();

    for (const attachment of email.attachments) {
      if (!attachment.inline || !attachment.contentId) continue;
      const blob = new Blob([attachment.content as unknown as BlobPart], { type: attachment.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      urls.push(blobUrl);
      idMap.set(normalizeContentId(attachment.contentId), blobUrl);
    }

    let html = email.html ?? null;
    if (html && idMap.size > 0) {
      html = html.replace(/(["'(])\s*cid:([^"')]+)/gi, (match, prefix: string, rawId: string) => {
        const blobUrl = idMap.get(rawId.trim());
        return blobUrl ? `${prefix}${blobUrl}` : match;
      });
    }

    return { bodyHtml: html, inlineUrls: urls };
  }, [email]);

  useEffect(() => {
    return () => {
      inlineUrls.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
    };
  }, [inlineUrls]);

  if (loading) {
    return (
      <div className="rfp-flex rfp-items-center rfp-justify-center rfp-w-full rfp-h-full">
        <div className="rfp-w-12 rfp-h-12 rfp-border-4 rfp-border-line-strong rfp-border-t-spinner-head rfp-rounded-full rfp-animate-spin" />
      </div>
    );
  }

  if (error || !email) {
    return <RendererError message={error || t('eml.parse_failed')} />;
  }

  const sender = formatAddressList(email.from);
  const to = formatAddressList(email.to);
  const cc = formatAddressList(email.cc);
  const bcc = formatAddressList(email.bcc);
  const sentDate = formatDate(email.date);
  const attachments = email.attachments.filter((attachment) => !attachment.inline);

  return (
    <div className="rfp-w-full rfp-h-full rfp-overflow-auto" style={{ background: 'white' }}>
      <div style={{ width: '100%', background: 'white', minHeight: '100%' }}>
        {/* 邮件头部 */}
        <div style={{ borderBottom: '1px solid #e5e7eb', padding: 'clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px)', background: '#f9fafb' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 'clamp(16px, 2.5vw, 20px)', fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>
            {email.subject || t('eml.no_subject')}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 'clamp(12px, 1.8vw, 14px)', color: '#4b5563' }}>
            {sender && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><User size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>From</span>
                  <span style={valueStyle}>{sender}</span>
                </div>
              </div>
            )}

            {to && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><Users size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>To</span>
                  <span style={valueStyle}>{to}</span>
                </div>
              </div>
            )}

            {cc && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><Users size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Cc</span>
                  <span style={valueStyle}>{cc}</span>
                </div>
              </div>
            )}

            {bcc && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><Users size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Bcc</span>
                  <span style={valueStyle}>{bcc}</span>
                </div>
              </div>
            )}

            {sentDate && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><Calendar size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Date</span>
                  <span style={valueStyle}>{sentDate}</span>
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div style={{ ...rowStyle, borderTop: '1px solid #e5e7eb', marginTop: '4px', paddingTop: '10px' }}>
                <span style={iconWrapStyle}><Paperclip size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Attachments</span>
                  <div style={{ ...valueStyle, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {attachments.map((attachment, index) => (
                      <span
                        key={`${attachment.filename}-${index}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          background: '#f3f4f6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          color: '#374151',
                          border: '1px solid #e5e7eb',
                        }}
                        title={attachment.mimeType}
                      >
                        <Tag size={12} style={{ color: '#9ca3af' }} />
                        {attachment.filename}
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>({formatSize(attachment.size)})</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {email.messageId && (
              <div style={{ ...rowStyle, marginTop: '4px' }}>
                <span style={iconWrapStyle}><Hash size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Message-ID</span>
                  <span style={{ ...valueStyle, fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{email.messageId}</span>
                </div>
              </div>
            )}

            {email.attachments.some((attachment) => attachment.inline) && (
              <div style={rowStyle}>
                <span style={iconWrapStyle}><Mail size={16} style={iconStyle} /></span>
                <div style={{ display: 'flex', flex: 1 }}>
                  <span style={labelStyle}>Inline</span>
                  <span style={{ ...valueStyle, fontSize: '12px', color: '#9ca3af' }}>
                    {email.attachments.filter((attachment) => attachment.inline).length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 邮件正文 */}
        {bodyHtml ? (
          <div
            style={{
              padding: 'clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: '1.6',
              color: '#333',
              overflowX: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <div
            style={{
              padding: 'clamp(12px, 3vw, 24px) clamp(16px, 3vw, 28px)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: '1.6',
              color: email.text ? '#333' : '#9ca3af',
              whiteSpace: email.text ? 'pre-wrap' : 'normal',
              wordBreak: 'break-word',
            }}
          >
            {email.text || t('eml.empty_body')}
          </div>
        )}
      </div>
    </div>
  );
});
