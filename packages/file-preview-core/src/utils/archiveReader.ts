/**
 * 通用压缩包读取工具（tar / tar.gz / tgz / gz / 7z / rar）
 *
 * 实现取舍：
 * - `tar`：自研解析（ustar / GNU longname / PAX extended header），零依赖
 * - `gzip`：fflate 动态加载（纯 JS inflate）
 * - `7z` / `rar`：需要 WASM 解压器（libarchive.js 的 worker 硬编码同目录 libarchive.wasm，
 *   在库打包场景下要求使用方额外部署静态资源，故本版本不内置），给出明确提示
 *
 * 输出与 `zipReader` 保持同一形状（ZipEntryInfo / ZipHandle），渲染层可复用同一套树形 UI。
 */
import type { ZipEntryInfo, ZipHandle } from './zipReader';
import { loadZip } from './zipReader';
import { decodeText } from './textDecoder';

/** 支持的压缩包容器格式 */
export type ArchiveFormat = 'tar' | 'gzip' | 'zip' | '7z' | 'rar';

/** 解析后的压缩包句柄（与 ZipHandle 同形，并支持释放 Worker 侧资源） */
export type ArchiveHandle = ZipHandle & {
  format: ArchiveFormat;
  /** 释放解压器占用的资源（zip/tar/gzip 为空操作，7z/rar 会终止 Worker） */
  dispose(): void;
};

const BLOCK_SIZE = 512;

/** 依扩展名判断容器格式；无法判断时返回 null */
export function detectArchiveFormat(fileName: string | undefined): ArchiveFormat | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.gz')) return 'gzip';
  if (lower.endsWith('.7z')) return '7z';
  if (lower.endsWith('.rar')) return 'rar';
  return null;
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  const trimmed = end >= 0 ? slice.subarray(0, end) : slice;
  return new TextDecoder('utf-8').decode(trimmed);
}

/** 读取 tar 数值字段（八进制，兼容 GNU base-256 编码） */
function readNumeric(bytes: Uint8Array, offset: number, length: number): number {
  if (bytes[offset] & 0x80) {
    let value = bytes[offset] & 0x7f;
    for (let i = offset + 1; i < offset + length; i++) {
      value = value * 256 + bytes[i];
    }
    return value;
  }
  const text = readString(bytes, offset, length).trim();
  if (text === '') return 0;
  const parsed = parseInt(text, 8);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** 判断某个 512 字节块是否全为 0（tar 结束标记） */
function isZeroBlock(bytes: Uint8Array, offset: number): boolean {
  for (let i = offset; i < offset + BLOCK_SIZE; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

/** 解析 PAX 扩展头记录，提取 path / size 覆盖值 */
function parsePaxRecords(bytes: Uint8Array): { path?: string; size?: number } {
  const text = new TextDecoder('utf-8').decode(bytes);
  const result: { path?: string; size?: number } = {};
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    if (space < 0) break;
    const recordLength = parseInt(text.slice(cursor, space), 10);
    if (Number.isNaN(recordLength) || recordLength <= 0) break;
    const record = text.slice(space + 1, cursor + recordLength).replace(/\n$/, '');
    const equals = record.indexOf('=');
    if (equals > 0) {
      const key = record.slice(0, equals);
      const value = record.slice(equals + 1);
      if (key === 'path') result.path = value;
      if (key === 'size') {
        const size = parseInt(value, 10);
        if (!Number.isNaN(size)) result.size = size;
      }
    }
    cursor += recordLength;
  }
  return result;
}

interface TarEntries {
  entries: ZipEntryInfo[];
  contents: Map<string, Uint8Array>;
}

/** 解析 tar 归档 */
function parseTar(bytes: Uint8Array): TarEntries {
  const entries: ZipEntryInfo[] = [];
  const contents = new Map<string, Uint8Array>();

  let offset = 0;
  let pendingLongName: string | null = null;
  let pendingPax: { path?: string; size?: number } = {};

  while (offset + BLOCK_SIZE <= bytes.length) {
    if (isZeroBlock(bytes, offset)) break;

    const rawName = readString(bytes, offset, 100);
    const prefix = readString(bytes, offset + 345, 155);
    const typeFlag = String.fromCharCode(bytes[offset + 156]) || '0';
    let size = readNumeric(bytes, offset + 124, 12);
    const mtime = readNumeric(bytes, offset + 136, 12);

    const dataStart = offset + BLOCK_SIZE;

    // GNU 长文件名：数据为下一个条目的真实名字
    if (typeFlag === 'L') {
      pendingLongName = new TextDecoder('utf-8').decode(bytes.subarray(dataStart, dataStart + size)).replace(/\0+$/, '');
      offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      continue;
    }

    // PAX 扩展头：数据为 key=value 记录
    if (typeFlag === 'x' || typeFlag === 'g') {
      const pax = parsePaxRecords(bytes.subarray(dataStart, dataStart + size));
      if (typeFlag === 'x') pendingPax = pax;
      offset = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
      continue;
    }

    const name = pendingPax.path ?? pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    if (pendingPax.size !== undefined) size = pendingPax.size;
    pendingLongName = null;
    pendingPax = {};

    const dataEnd = dataStart + size;
    const dataNext = dataStart + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    const isDir = typeFlag === '5' || name.endsWith('/');
    const isFile = typeFlag === '0' || typeFlag === '\0' || typeFlag === '7' || typeFlag === '';

    if (isDir) {
      const normalized = name.endsWith('/') ? name : `${name}/`;
      const trimmed = normalized.replace(/\/$/, '');
      const lastSlash = trimmed.lastIndexOf('/');
      entries.push({
        path: normalized,
        name: lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed,
        dir: lastSlash >= 0 ? trimmed.slice(0, lastSlash) : '',
        isDir: true,
        size: 0,
        encrypted: false,
        date: mtime > 0 ? new Date(mtime * 1000) : undefined,
      });
    } else if (isFile) {
      const lastSlash = name.lastIndexOf('/');
      entries.push({
        path: name,
        name: lastSlash >= 0 ? name.slice(lastSlash + 1) : name,
        dir: lastSlash >= 0 ? name.slice(0, lastSlash) : '',
        isDir: false,
        size,
        encrypted: false,
        date: mtime > 0 ? new Date(mtime * 1000) : undefined,
      });
      // subarray 只做视图，不复制内容
      contents.set(name, bytes.subarray(dataStart, dataEnd));
    }

    offset = dataNext;
  }

  return { entries, contents };
}

/** 判断字节流是否为 tar（ustar magic） */
function looksLikeTar(bytes: Uint8Array): boolean {
  if (bytes.length < 265) return false;
  const magic = new TextDecoder('latin1').decode(bytes.subarray(257, 262));
  return magic === 'ustar';
}

function createHandle(
  format: ArchiveFormat,
  entries: ZipEntryInfo[],
  contents: Map<string, Uint8Array>,
): ArchiveHandle {
  return {
    format,
    entries,
    dispose(): void {
      contents.clear();
    },
    async readBlob(path: string, mimeType?: string): Promise<Blob> {
      const data = contents.get(path);
      if (!data) throw new Error(`压缩包条目不存在: ${path}`);
      return new Blob([data as unknown as BlobPart], mimeType ? { type: mimeType } : undefined);
    },
    async readText(path: string): Promise<string> {
      const data = contents.get(path);
      if (!data) throw new Error(`压缩包条目不存在: ${path}`);
      return decodeText(data);
    },
  };
}

/**
 * 读取压缩包
 *
 * @param buffer 文件字节
 * @param fileName 原始文件名（用于判断容器格式）
 * @throws 当容器格式不支持或结构损坏时抛出
 */
export async function loadArchive(buffer: ArrayBuffer, fileName?: string): Promise<ArchiveHandle> {
  const bytes = new Uint8Array(buffer);
  let format = detectArchiveFormat(fileName);

  // 无扩展名时按内容嗅探：gzip 魔数 1f 8b
  if (!format) {
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      format = 'gzip';
    } else if (looksLikeTar(bytes)) {
      format = 'tar';
    }
  }

  if (format === '7z' || format === 'rar') {
    // 在 Worker 中经 7z-wasm 解压（wasm 内联，按需加载）
    const { openSevenZipArchiveHandle } = await import('../workers/archiveWorkerClient');
    return openSevenZipArchiveHandle(buffer, fileName ?? `archive.${format}`);
  }

  if (format === 'tar') {
    const { entries, contents } = parseTar(bytes);
    if (entries.length === 0) throw new Error('TAR 归档为空或结构无法识别');
    return createHandle('tar', entries, contents);
  }

  if (format === 'gzip') {
    const { gunzipSync } = await import('fflate');
    let inflated: Uint8Array;
    try {
      inflated = gunzipSync(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new Error(`GZIP 解压失败: ${message}`);
    }

    const lower = (fileName ?? '').toLowerCase();
    const isTarGz = lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || looksLikeTar(inflated);

    if (isTarGz) {
      const { entries, contents } = parseTar(inflated);
      if (entries.length === 0) throw new Error('TAR 归档为空或结构无法识别');
      return createHandle('tar', entries, contents);
    }

    // 单文件 gzip：以去掉 .gz 的文件名作为唯一条目
    const baseName = (fileName ?? 'file').replace(/\.gz$/i, '').split('/').pop() || 'file';
    const entry: ZipEntryInfo = {
      path: baseName,
      name: baseName,
      dir: '',
      isDir: false,
      size: inflated.byteLength,
      encrypted: false,
    };
    return createHandle('gzip', [entry], new Map([[baseName, inflated]]));
  }

  // 兜底：按 zip 处理（jar / 无扩展名 zip）
  const zipHandle = await loadZip(buffer);
  return {
    format: 'zip',
    entries: zipHandle.entries,
    dispose(): void {
      // no-op
    },
    readBlob: (path, mimeType) => zipHandle.readBlob(path, mimeType),
    readText: (path) => zipHandle.readText(path),
  };
}
