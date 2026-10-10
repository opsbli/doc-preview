/**
 * drawio / mxGraph 文件解析工具
 *
 * .drawio 本质是 mxGraphModel XML，有两种存放方式：
 * - 未压缩：`<mxfile><diagram><mxGraphModel>...</mxGraphModel></diagram></mxfile>` 或直接是 `<mxGraphModel>`
 * - 已压缩（drawio 默认）：`<diagram>` 的文本内容是
 *   `URL-encode( base64( raw-deflate( mxGraphModel XML ) ) )`
 *
 * 这里刻意不用 DOMParser：drawio 文件由工具生成、结构规整，用定向正则提取可让本模块
 * 在 Node 下被直接测试，且不必为纯文本解析引入 DOM。
 */

/** 单个图（drawio 的一个页面） */
export interface DrawioDiagram {
  /** 图名（diagram 的 name 属性，可能为空） */
  name: string;
  /** mxGraphModel XML */
  xml: string;
}

export interface ParsedDrawio {
  diagrams: DrawioDiagram[];
}

const DECODER = new TextDecoder('utf-8');

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 解出 `<diagram>` 内的载荷
 *
 * @param payload diagram 元素的文本内容（可能为空）
 * @returns mxGraphModel XML
 */
export async function decodeDrawioPayload(payload: string): Promise<string> {
  const trimmed = payload.trim();
  if (trimmed === '') {
    return '';
  }

  // 未压缩：内容本身就是 XML
  if (trimmed.startsWith('<')) {
    return trimmed;
  }

  // 压缩：URL-encode(base64(raw deflate(xml)))
  const base64 = trimmed.includes('%') ? decodeURIComponent(trimmed) : trimmed;
  const { inflateSync, unzlibSync } = await import('fflate');

  let inflated: Uint8Array;
  try {
    inflated = inflateSync(base64ToBytes(base64));
  } catch {
    // 少数工具会写成带 zlib 头的形式，兜底再试一次
    inflated = unzlibSync(base64ToBytes(base64));
  }

  return DECODER.decode(inflated);
}

/**
 * 解析 .drawio / mxGraph XML 内容
 *
 * @throws 当内容既不是 mxGraphModel 也不含任何可用 diagram 时抛出
 */
export async function parseDrawio(content: string): Promise<ParsedDrawio> {
  const trimmed = content.trim();
  if (trimmed === '') {
    throw new Error('drawio 文件为空');
  }

  // 直接就是 mxGraphModel
  if (trimmed.startsWith('<mxGraphModel')) {
    return { diagrams: [{ name: '', xml: trimmed }] };
  }

  if (!trimmed.includes('<mxfile')) {
    throw new Error('不是有效的 drawio 文件（缺少 mxfile / mxGraphModel）');
  }

  const diagramPattern = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/gi;
  const diagrams: DrawioDiagram[] = [];
  let match: RegExpExecArray | null;

  while ((match = diagramPattern.exec(trimmed)) !== null) {
    const attributes = match[1] ?? '';
    const nameMatch = /name="([^"]*)"/i.exec(attributes);
    const xml = await decodeDrawioPayload(match[2] ?? '');
    if (xml.startsWith('<mxGraphModel')) {
      diagrams.push({ name: nameMatch ? nameMatch[1] : '', xml });
    }
  }

  if (diagrams.length === 0) {
    throw new Error('drawio 文件中没有可渲染的图');
  }

  return { diagrams };
}
