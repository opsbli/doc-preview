/**
 * 7z / rar 解压的纯逻辑层（不依赖 7z-wasm 本体，也不依赖 Vite 特性）
 *
 * 分层原因：
 * - Web Worker 中通过 7z-wasm（Emscripten + 7-Zip 24.09）执行真实的 7z / rar 解压；
 * - 具体模块工厂由调用方注入（浏览器 worker 注入内联 wasm 的实例，Node 测试直接从 node_modules 加载），
 *   使本文件可在 node 下被直接测试，且不会把 wasm 打进主 bundle。
 *
 * 7-Zip 以「每条命令一次进程」为设计，经实测：同一模块实例在 `noExitRuntime: true`
 * 下可重复 callMain（创建 → 列表 → 抽取均成功），因此复用单实例。
 */
import type { ZipEntryInfo } from './zipReader';

/** Emscripten FS 中本模块用到的最小接口 */
export interface SevenZipFileSystem {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  mkdir(path: string): unknown;
  readdir(path: string): string[];
  unlink(path: string): void;
  rmdir(path: string): void;
}

/** 7z-wasm 模块实例的最小接口 */
export interface SevenZipModule {
  FS: SevenZipFileSystem;
  callMain(args: string[]): void;
}

/** 创建 7z-wasm 模块的工厂（浏览器不传 wasmBinary，由打包内联的 data URL 提供；Node 测试传磁盘字节） */
export type SevenZipFactory = (options: {
  wasmBinary?: ArrayBuffer;
  noExitRuntime?: boolean;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
}) => Promise<SevenZipModule>;

/** 解压会话：提供条目列表与按路径读取能力 */
export interface SevenZipSession {
  /** 归档内条目（目录以 `/` 结尾） */
  entries: ZipEntryInfo[];
  /** 按路径读取单个条目的原始字节 */
  readFile(path: string): Promise<Uint8Array>;
  /** 释放归档与临时文件（best-effort） */
  dispose(): void;
}

/** 列表输出中的分隔线：其之前是归档自身的元信息 */
const SECTION_SEPARATOR = '----------';

function parseModified(value: string): Date | undefined {
  // 形如 "2026-10-10 11:20:29.1570000"（本地时间）
  const normalized = value.trim().replace(' ', 'T').replace(/(\.\d{3})\d*$/, '$1');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * 解析 `7z l -slt` 的输出为条目列表。
 *
 * 输出结构：归档元信息块 → `----------` → 每个条目一个 `key = value` 块（空行分隔）。
 * 目录由 `Attributes` 的 `D` 标志识别（如 `D drwxrwxrwx`）。
 */
export function parseSevenZipListing(output: string): ZipEntryInfo[] {
  const lines = output.split('\n');
  const separatorIndex = lines.findIndex((line) => line.trim() === SECTION_SEPARATOR);
  if (separatorIndex < 0) return [];

  const entries: ZipEntryInfo[] = [];
  let fields: Record<string, string> = {};

  const flush = () => {
    const current = fields;
    fields = {};

    const rawPath = (current.Path ?? '').trim();
    if (!rawPath) return;

    const attributes = (current.Attributes ?? '').trim();
    const isDir = attributes.startsWith('D') || rawPath.endsWith('/');
    const trimmed = rawPath.replace(/\/$/, '');
    const lastSlash = trimmed.lastIndexOf('/');
    const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
    const dir = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : '';
    const size = isDir ? 0 : Number.parseInt((current.Size ?? '0').trim(), 10) || 0;

    entries.push({
      path: isDir ? `${trimmed}/` : trimmed,
      name,
      dir,
      isDir,
      size,
      encrypted: (current.Encrypted ?? '').trim() === '+',
      date: current.Modified ? parseModified(current.Modified) : undefined,
    });
  };

  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      flush();
      continue;
    }
    const equals = line.indexOf(' = ');
    if (equals < 0) continue;
    const key = line.slice(0, equals).trim();
    // 同名键取第一次出现（Path 等在块内唯一）
    if (!(key in fields)) fields[key] = line.slice(equals + 3);
  }
  flush();

  return entries;
}

/** 拒绝可疑路径，避免越出解压根目录 */
function assertSafePath(path: string): void {
  if (path === '' || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error(`压缩包条目路径不合法: ${path}`);
  }
}

/**
 * 打开 7z / rar 归档：写入虚拟文件系统、列出条目，并返回按需解压的会话。
 *
 * @param factory 模块工厂
 * @param buffer 归档文件字节
 * @param fileName 原始文件名（用于错误信息与虚拟路径后缀）
 * @param wasmBinary 可选：wasm 字节（浏览器下由 worker 内联的 data URL 提供，Node 测试传磁盘字节）
 */
export async function openSevenZipArchive(
  factory: SevenZipFactory,
  buffer: ArrayBuffer,
  fileName: string,
  wasmBinary?: ArrayBuffer,
): Promise<SevenZipSession> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const module = await factory({
    ...(wasmBinary ? { wasmBinary } : {}),
    noExitRuntime: true,
    print: (line) => stdout.push(line),
    printErr: (line) => stderr.push(line),
  });

  const extension = /\.rar$/i.test(fileName) ? 'rar' : '7z';
  const archivePath = `archive.${extension}`;
  const extractRoot = 'extract';
  let extractCounter = 0;

  module.FS.writeFile(archivePath, new Uint8Array(buffer));

  const run = (args: string[]): string => {
    stdout.length = 0;
    stderr.length = 0;
    try {
      module.callMain(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`7-Zip 执行失败 (${args[0]}): ${message}`);
    }
    return stdout.join('\n');
  };

  let listing: string;
  try {
    listing = run(['l', '-slt', archivePath]);
  } catch (error) {
    const detail = stderr.join(' ').trim();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(detail ? `${message}｜${detail}` : message);
  }

  const entries = parseSevenZipListing(listing);
  if (entries.length === 0) {
    const detail = stderr.join(' ').trim();
    throw new Error(detail || '无法读取归档目录（文件可能已加密或格式不受支持）');
  }

  try {
    module.FS.mkdir(extractRoot);
  } catch {
    // 已存在则忽略
  }

  return {
    entries,
    async readFile(path: string): Promise<Uint8Array> {
      assertSafePath(path);
      const outDir = `${extractRoot}/${extractCounter++}`;
      module.FS.mkdir(outDir);
      try {
        run(['x', '-y', `-o${outDir}`, archivePath, path]);
        const data = module.FS.readFile(`${outDir}/${path}`);
        // 复制出来，便于随后释放 FS 中的临时文件
        return new Uint8Array(data);
      } finally {
        try {
          module.FS.unlink(`${outDir}/${path}`);
        } catch {
          // 忽略
        }
        try {
          const leftovers = module.FS.readdir(outDir).filter((name) => name !== '.' && name !== '..');
          for (const name of leftovers) module.FS.unlink(`${outDir}/${name}`);
          module.FS.rmdir(outDir);
        } catch {
          // 忽略
        }
      }
    },
    dispose(): void {
      for (const entry of entries) {
        const target = entry.isDir ? entry.path.replace(/\/$/, '') : entry.path;
        try {
          if (entry.isDir) module.FS.rmdir(target);
          else module.FS.unlink(target);
        } catch {
          // 忽略
        }
      }
      try {
        module.FS.unlink(archivePath);
      } catch {
        // 忽略
      }
    },
  };
}
