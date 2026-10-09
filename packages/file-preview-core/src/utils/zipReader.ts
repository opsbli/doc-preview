/**
 * ZIP 工具：基于 @zip.js/zip.js 读取压缩包结构
 * 仅做 framework-agnostic 的读取与分类，渲染交由 renderer 自行处理
 *
 * 相比 jszip：@zip.js/zip.js 原生支持加密 ZIP（ZipCrypto 传统加密 + AES），
 * 可解密 Windows 资源管理器 / WinRAR 等工具加密的压缩包。
 */
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { decodeText } from './textDecoder';

export interface ZipEntryInfo {
  /** 完整路径（以 / 分隔，目录带尾部 /） */
  path: string;
  /** 文件名（不含路径） */
  name: string;
  /** 所在目录路径（不含尾部 /） */
  dir: string;
  /** 是否目录 */
  isDir: boolean;
  /** 未压缩大小（字节），目录为 0 */
  size: number;
  /** 是否加密 */
  encrypted: boolean;
  /** 最后修改时间 */
  date?: Date;
}

export interface ZipTreeNode {
  /** 名称（不含父路径） */
  name: string;
  /** 完整路径（目录带尾部 /） */
  path: string;
  /** 是否目录 */
  isDir: boolean;
  /** 子节点（仅目录） */
  children?: ZipTreeNode[];
  /** 文件大小 */
  size: number;
}

/** ZIP 需要密码（文件加密且未提供密码）时抛出 */
export class ZipPasswordError extends Error {
  constructor() {
    super('ZIP requires password');
    this.name = 'ZipPasswordError';
  }
}

/** ZIP 密码错误（解密失败）时抛出 */
export class ZipInvalidPasswordError extends Error {
  constructor() {
    super('Invalid ZIP password');
    this.name = 'ZipInvalidPasswordError';
  }
}

/**
 * 加载后的 ZIP 句柄：提供条目列表与按路径读取能力
 */
export interface ZipHandle {
  /** 平铺条目列表 */
  entries: ZipEntryInfo[];
  /** 按完整路径读取条目为 Blob（解密时需 password） */
  readBlob(path: string, mimeType?: string): Promise<Blob>;
  /** 按完整路径读取条目为文本（自动编码检测） */
  readText(path: string): Promise<string>;
}

function toEntryInfo(entry: {
  filename: string;
  directory: boolean;
  encrypted: boolean;
  uncompressedSize: number;
  lastModDate?: Date;
}): ZipEntryInfo {
  const raw = entry.filename;
  const isDir = entry.directory;
  const normalized = isDir && !raw.endsWith('/') ? raw + '/' : raw;
  const trimmed = isDir ? normalized.replace(/\/$/, '') : normalized;
  const lastSlash = trimmed.lastIndexOf('/');
  const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dir = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : '';
  return {
    path: normalized,
    name,
    dir,
    isDir,
    size: isDir ? 0 : entry.uncompressedSize,
    encrypted: entry.encrypted,
    date: entry.lastModDate,
  };
}

/**
 * 文件名/注释解码：UTF-8 严格解码失败时回退 GBK。
 * Windows 资源管理器创建的 ZIP 常使用 GBK 编码文件名（未设置 UTF-8 标志位），
 * @zip.js 默认解码会产生乱码（如 "╟ß┴┐╗»"），此处做降级解码。
 * 返回 undefined 时由 @zip.js 使用默认解码。
 */
function decodeZipText(value: Uint8Array): string | undefined {
  // 纯 ASCII 直接返回（GBK 与 UTF-8 在 ASCII 范围一致）
  let ascii = true;
  for (const b of value) {
    if (b >= 0x80) { ascii = false; break; }
  }
  if (ascii) return undefined;

  // 先尝试严格 UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    // UTF-8 解码失败 → GBK（中文 Windows 常见编码）
    try {
      return new TextDecoder('gbk').decode(value);
    } catch {
      return undefined; // 交给 @zip.js 默认解码
    }
  }
}

/**
 * 从 ArrayBuffer 加载 zip。
 *
 * @param buffer ZIP 文件字节
 * @param password 可选密码：文件加密时必须提供，否则抛 ZipPasswordError
 * @throws ZipPasswordError 文件加密但未提供密码
 * @throws ZipInvalidPasswordError 密码错误
 */
export async function loadZip(buffer: ArrayBuffer, password?: string): Promise<ZipHandle> {
  const bytes = new Uint8Array(buffer);
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const rawEntries = await reader.getEntries({
    decodeText: decodeZipText,
  });

  const entries = rawEntries.map(toEntryInfo);

  // 检测是否有加密条目
  const hasEncrypted = entries.some((e) => e.encrypted);
  if (hasEncrypted && !password) {
    throw new ZipPasswordError();
  }

  const findEntry = (path: string) => {
    const e = rawEntries.find((r) => r.filename === path || (path.endsWith('/') && r.filename === path));
    if (!e) {
      // 目录条目可能不带尾部斜杠，尝试精确匹配
      const fallback = rawEntries.find((r) => r.filename === path.replace(/\/$/, ''));
      if (!fallback) throw new Error(`ZIP entry not found: ${path}`);
      return fallback;
    }
    return e;
  };

  const readUint8 = async (path: string): Promise<Uint8Array> => {
    const entry = findEntry(path);
    if (entry.directory) throw new Error(`ZIP entry is a directory: ${path}`);
    try {
      return await entry.getData(new Uint8ArrayWriter(), password ? { password } : undefined);
    } catch (err: any) {
      // 密码错误：@zip.js 抛 "Invalid password" / "Invalid encrypted stream"
      if (hasEncrypted && err?.message && /password|encrypted|decrypt/i.test(err.message)) {
        throw new ZipInvalidPasswordError();
      }
      throw err;
    }
  };

  return {
    entries,
    async readBlob(path: string, mimeType?: string): Promise<Blob> {
      const data = await readUint8(path);
      return new Blob([data as unknown as BlobPart], mimeType ? { type: mimeType } : undefined);
    },
    async readText(path: string): Promise<string> {
      const data = await readUint8(path);
      return decodeText(data);
    },
  };
}

/**
 * 将平铺的条目组织为树
 */
export function buildZipTree(entries: ZipEntryInfo[]): ZipTreeNode {
  const root: ZipTreeNode = { name: '', path: '', isDir: true, children: [], size: 0 };
  const dirMap = new Map<string, ZipTreeNode>();
  dirMap.set('', root);

  const ensureDir = (dirPath: string): ZipTreeNode => {
    if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;
    const parts = dirPath.split('/').filter(Boolean);
    let current = root;
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part;
      let next = dirMap.get(accum);
      if (!next) {
        next = { name: part, path: accum + '/', isDir: true, children: [], size: 0 };
        current.children!.push(next);
        dirMap.set(accum, next);
      }
      current = next;
    }
    return current;
  };

  // 先处理文件；目录按需生成
  for (const entry of entries) {
    if (entry.isDir) {
      ensureDir(entry.path.replace(/\/$/, ''));
      continue;
    }
    const parent = ensureDir(entry.dir);
    parent.children!.push({
      name: entry.name,
      path: entry.path,
      isDir: false,
      size: entry.size,
    });
  }

  // 排序：目录在前，按名称
  const sort = (node: ZipTreeNode) => {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) sort(child);
  };
  sort(root);
  return root;
}

/** @deprecated 兼容旧 API：请使用 loadZip 返回的 ZipHandle 的方法 */
export async function readZipEntryText(zip: ZipHandle, path: string): Promise<string> {
  return zip.readText(path);
}

/** @deprecated 兼容旧 API：请使用 loadZip 返回的 ZipHandle 的方法 */
export async function readZipEntryBlob(zip: ZipHandle, path: string, mimeType?: string): Promise<Blob> {
  return zip.readBlob(path, mimeType);
}
