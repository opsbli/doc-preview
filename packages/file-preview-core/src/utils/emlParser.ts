/**
 * .eml（RFC 822 / MIME 邮件）解析工具
 *
 * 基于 postal-mime 解析为归一化模型，供各框架渲染器直接展示。
 * 正文 HTML 会经 `sanitizeEmailHtml` 做尽力而为的清洗（见该文件的能力边界说明）。
 */
import PostalMime from 'postal-mime';
import { sanitizeEmailHtml } from './htmlSanitize';

/** 归一化后的邮件地址 */
export interface EmailAddress {
  /** 显示名 */
  name?: string;
  /** 邮箱地址 */
  address?: string;
}

/** 归一化后的附件 */
export interface EmailAttachment {
  /** 文件名（无名称时回退为 "attachment-N"） */
  filename: string;
  /** MIME 类型 */
  mimeType: string;
  /** 字节数 */
  size: number;
  /** Content-ID（内联图片等） */
  contentId?: string;
  /** 是否为正文内联引用（Content-Disposition: inline / related） */
  inline: boolean;
  /** 附件内容 */
  content: Uint8Array;
}

/** 归一化后的邮件 */
export interface ParsedEml {
  /** 主题（无主题时为空字符串） */
  subject: string;
  /** 发送时间（ISO 8601 或原始头值） */
  date?: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  /** Message-ID（保留尖括号） */
  messageId?: string;
  /** 清洗后的 HTML 正文 */
  html?: string;
  /** 纯文本正文 */
  text?: string;
  attachments: EmailAttachment[];
}

type RawAddress = { name?: string; address?: string; group?: RawAddress[] };

type RawAttachment = {
  filename?: string | null;
  mimeType?: string;
  disposition?: string | null;
  related?: boolean;
  contentId?: string;
  content?: ArrayBuffer | Uint8Array | string;
  encoding?: 'base64' | 'utf8' | string;
};

type RawEmail = {
  from?: RawAddress;
  to?: RawAddress[];
  cc?: RawAddress[];
  bcc?: RawAddress[];
  subject?: string;
  date?: string;
  messageId?: string;
  html?: string;
  text?: string;
  attachments?: RawAttachment[];
};

/** 展开地址组（`Team: a@x.com, b@x.com;`）为扁平地址列表 */
function flattenAddresses(value: RawAddress | RawAddress[] | undefined): EmailAddress[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const result: EmailAddress[] = [];

  const visit = (address: RawAddress) => {
    if (Array.isArray(address.group)) {
      address.group.forEach(visit);
      return;
    }
    const name = typeof address.name === 'string' && address.name !== '' ? address.name : undefined;
    const email = typeof address.address === 'string' && address.address !== '' ? address.address : undefined;
    if (name || email) result.push({ name, address: email });
  };

  list.forEach(visit);
  return result;
}

function toUint8Array(content: RawAttachment['content'], encoding: string | undefined): Uint8Array {
  if (typeof content === 'string') {
    if (encoding === 'base64') {
      const binary = atob(content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return new Uint8Array(0);
}

function normalizeAttachments(attachments: RawAttachment[] | undefined): EmailAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment, index) => {
    const content = toUint8Array(attachment.content, attachment.encoding);
    const filename =
      typeof attachment.filename === 'string' && attachment.filename !== ''
        ? attachment.filename
        : `attachment-${index + 1}`;
    return {
      filename,
      mimeType: attachment.mimeType || 'application/octet-stream',
      size: content.byteLength,
      contentId: attachment.contentId,
      inline: attachment.related === true || attachment.disposition === 'inline',
      content,
    };
  });
}

/**
 * 解析 .eml 邮件
 *
 * @param input 原始邮件字节（ArrayBuffer / Uint8Array）或原始文本
 * @throws 当 MIME 结构无法解析时抛出
 */
export async function parseEml(input: ArrayBuffer | Uint8Array | string): Promise<ParsedEml> {
  let parsed: RawEmail;
  try {
    parsed = (await PostalMime.parse(input)) as unknown as RawEmail;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`EML 解析失败: ${message}`);
  }

  const html = typeof parsed.html === 'string' && parsed.html.trim() !== '' ? parsed.html : undefined;
  const text = typeof parsed.text === 'string' && parsed.text.trim() !== '' ? parsed.text : undefined;

  return {
    subject: typeof parsed.subject === 'string' ? parsed.subject : '',
    date: typeof parsed.date === 'string' ? parsed.date : undefined,
    from: flattenAddresses(parsed.from),
    to: flattenAddresses(parsed.to),
    cc: flattenAddresses(parsed.cc),
    bcc: flattenAddresses(parsed.bcc),
    messageId: typeof parsed.messageId === 'string' ? parsed.messageId : undefined,
    html: html ? sanitizeEmailHtml(html) : undefined,
    text,
    attachments: normalizeAttachments(parsed.attachments),
  };
}
