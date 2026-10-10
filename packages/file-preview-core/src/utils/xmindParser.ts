/**
 * XMind 思维导图解析工具
 *
 * .xmind 本质是 ZIP 容器：
 * - XMind Zen / 2020+ 使用根级 `content.json`（JSON 主题树）
 * - 旧版 XMind 8 使用根级 `content.xml`（XML 主题树，需 DOMParser）
 *
 * 这里只做「解包 + 结构归一化」，不处理画布布局与主题样式，
 * 由各框架渲染器自行决定呈现方式（树 / 大纲）。
 */
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { decodeText } from './textDecoder';

/** 归一化后的思维导图节点 */
export interface MindmapNode {
  /** 主题标题 */
  title: string;
  /** 备注（纯文本） */
  notes?: string;
  /** 标签 */
  labels?: string[];
  /** 子主题 */
  children: MindmapNode[];
}

/** 单个画布（XMind 的一个 sheet） */
export interface MindmapSheet {
  /** 画布标题 */
  title: string;
  /** 根主题 */
  root: MindmapNode;
}

/** 解析结果 */
export interface ParsedXmind {
  /** 所有画布，至少一个 */
  sheets: MindmapSheet[];
}

/** 主题树节点总数（含根） */
export function countMindmapNodes(node: MindmapNode): number {
  return 1 + node.children.reduce((total, child) => total + countMindmapNodes(child), 0);
}

type JsonTopic = {
  title?: unknown;
  notes?: { plain?: { content?: unknown } } | string;
  labels?: unknown;
  children?: { attached?: unknown };
};

type JsonSheet = {
  title?: unknown;
  rootTopic?: JsonTopic;
};

function normalizeTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNotes(notes: JsonTopic['notes']): string | undefined {
  if (typeof notes === 'string') return notes.trim() || undefined;
  const content = notes?.plain?.content;
  if (typeof content === 'string') return content.trim() || undefined;
  return undefined;
}

function normalizeLabels(labels: unknown): string[] | undefined {
  if (!Array.isArray(labels)) return undefined;
  const result = labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '');
  return result.length > 0 ? result : undefined;
}

function convertJsonTopic(topic: JsonTopic | undefined | null): MindmapNode {
  const attached = topic?.children?.attached;
  const children = Array.isArray(attached)
    ? attached.map((child) => convertJsonTopic(child as JsonTopic))
    : [];
  return {
    title: normalizeTitle(topic?.title),
    notes: normalizeNotes(topic?.notes),
    labels: normalizeLabels(topic?.labels),
    children,
  };
}

function parseJsonContent(text: string): ParsedXmind {
  const data: unknown = JSON.parse(text);

  let rawSheets: JsonSheet[];
  if (Array.isArray(data)) {
    rawSheets = data as JsonSheet[];
  } else if (data && typeof data === 'object' && 'rootTopic' in data) {
    rawSheets = [data as JsonSheet];
  } else {
    throw new Error('content.json 结构无法识别');
  }

  const sheets = rawSheets
    .filter((sheet) => sheet && typeof sheet === 'object' && sheet.rootTopic)
    .map((sheet, index) => ({
      title: normalizeTitle(sheet.title) || `Sheet ${index + 1}`,
      root: convertJsonTopic(sheet.rootTopic),
    }));

  if (sheets.length === 0) {
    throw new Error('content.json 中没有可用的画布');
  }

  return { sheets };
}

/** 取元素的直接子元素（不改用 querySelector，避免匹配到深层同名节点） */
function directChild(element: Element, tagName: string): Element | null {
  for (const child of Array.from(element.children)) {
    if (child.tagName === tagName) return child;
  }
  return null;
}

function convertXmlTopic(element: Element): MindmapNode {
  const title = directChild(element, 'title')?.textContent?.trim() ?? '';

  const notesElement = directChild(element, 'notes');
  const notes = notesElement
    ? (directChild(notesElement, 'plain')?.textContent?.trim() || notesElement.textContent?.trim() || undefined)
    : undefined;

  const labelsElement = directChild(element, 'labels');
  const labels = labelsElement
    ? Array.from(labelsElement.children)
        .filter((child) => child.tagName === 'label')
        .map((child) => child.textContent?.trim() ?? '')
        .filter((label) => label !== '')
    : [];

  const children: MindmapNode[] = [];
  const childrenElement = directChild(element, 'children');
  if (childrenElement) {
    for (const topicsElement of Array.from(childrenElement.children)) {
      if (topicsElement.tagName !== 'topics') continue;
      const type = topicsElement.getAttribute('type');
      if (type && type !== 'attached') continue;
      for (const topicElement of Array.from(topicsElement.children)) {
        if (topicElement.tagName === 'topic') children.push(convertXmlTopic(topicElement));
      }
    }
  }

  return {
    title,
    notes: notes || undefined,
    labels: labels.length > 0 ? labels : undefined,
    children,
  };
}

function parseXmlContent(text: string): ParsedXmind {
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前环境不支持 XML 解析，无法读取旧版 content.xml');
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('content.xml 解析失败');
  }

  const sheets = Array.from(doc.getElementsByTagName('sheet')).map((sheetElement, index) => {
    const rootElement = directChild(sheetElement, 'topic');
    return {
      title: directChild(sheetElement, 'title')?.textContent?.trim() || `Sheet ${index + 1}`,
      root: rootElement ? convertXmlTopic(rootElement) : { title: '', children: [] },
    };
  });

  if (sheets.length === 0) {
    throw new Error('content.xml 中没有可用的画布');
  }

  return { sheets };
}

/**
 * 解析 .xmind 文件
 *
 * @param buffer .xmind 文件字节
 * @throws 当容器中没有 content.json / content.xml，或内容无法解析时抛出
 */
export async function parseXmind(buffer: ArrayBuffer): Promise<ParsedXmind> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
  let entries: Awaited<ReturnType<typeof reader.getEntries>>;
  try {
    entries = await reader.getEntries();
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`XMind 容器解析失败: ${message}`);
  }

  const findBaseName = (baseNames: string[]) =>
    entries.find((entry) => {
      if (entry.directory) return false;
      const base = entry.filename.split('/').pop() ?? '';
      return baseNames.includes(base);
    });

  try {
    const jsonEntry = findBaseName(['content.json']);
    if (jsonEntry && !jsonEntry.directory) {
      const text = decodeText(await jsonEntry.getData(new Uint8ArrayWriter()));
      return parseJsonContent(text);
    }

    const xmlEntry = findBaseName(['content.xml']);
    if (xmlEntry && !xmlEntry.directory) {
      const text = decodeText(await xmlEntry.getData(new Uint8ArrayWriter()));
      return parseXmlContent(text);
    }

    throw new Error('XMind 容器中未找到 content.json 或 content.xml');
  } finally {
    await reader.close().catch(() => undefined);
  }
}
