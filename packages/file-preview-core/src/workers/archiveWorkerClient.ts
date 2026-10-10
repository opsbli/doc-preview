// @ts-ignore - Vite 虚拟模块，无类型声明
import ArchiveDecoderWorker from './archiveDecoder.worker?worker&inline';
import { decodeText } from '../utils/textDecoder';
import type { ZipEntryInfo } from '../utils/zipReader';

/**
 * 7z / rar 归档句柄（在 Worker 中解压，主线程只做转发）
 */
export interface SevenZipArchiveHandle {
  format: '7z' | 'rar';
  entries: ZipEntryInfo[];
  readBlob(path: string, mimeType?: string): Promise<Blob>;
  readText(path: string): Promise<string>;
  /** 终止 Worker 并释放 wasm 侧资源 */
  dispose(): void;
}

interface PendingRequest {
  resolve: (value: { entries?: ZipEntryInfo[]; data?: ArrayBuffer }) => void;
  reject: (error: Error) => void;
}

interface DoneResponse {
  type: 'done';
  id: string;
  entries?: ZipEntryInfo[];
  data?: ArrayBuffer;
}

interface ErrorResponse {
  type: 'error';
  id: string;
  message: string;
}

type WorkerResponse = DoneResponse | ErrorResponse;

/**
 * 在 Worker 中打开 7z / rar 归档
 *
 * @param buffer 归档字节（会被转移给 Worker，调用后原 buffer 失效）
 * @param fileName 原始文件名（用于判定 7z / rar 与错误信息）
 */
export async function openSevenZipArchiveHandle(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<SevenZipArchiveHandle> {
  let worker: Worker;
  try {
    worker = new ArchiveDecoderWorker();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法创建 7z/rar 解压 Worker: ${message}`);
  }

  const pending = new Map<string, PendingRequest>();
  let disposed = false;

  const failAll = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.type === 'error') {
      request.reject(new Error(response.message));
    } else {
      request.resolve({ entries: response.entries, data: response.data });
    }
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    failAll(new Error(event.message || '7z/rar 解压 Worker 崩溃'));
  });

  const send = (message: Record<string, unknown>, transfer: Transferable[] = []) =>
    new Promise<{ entries?: ZipEntryInfo[]; data?: ArrayBuffer }>((resolve, reject) => {
      if (disposed) {
        reject(new Error('归档已关闭'));
        return;
      }
      const id = Math.random().toString(36).slice(2);
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id }, transfer);
    });

  // wasm 字节由 Worker 打包时内联（data URL），主线程只转移归档字节
  const format: '7z' | 'rar' = /\.rar$/i.test(fileName) ? 'rar' : '7z';

  const opened = await send({ type: 'open', buffer, fileName }, [buffer]);
  const entries = opened.entries ?? [];

  return {
    format,
    entries,
    async readBlob(path: string, mimeType?: string): Promise<Blob> {
      const result = await send({ type: 'read', path });
      const data = result.data ?? new ArrayBuffer(0);
      return new Blob([data as unknown as BlobPart], mimeType ? { type: mimeType } : undefined);
    },
    async readText(path: string): Promise<string> {
      const result = await send({ type: 'read', path });
      return decodeText(new Uint8Array(result.data ?? new ArrayBuffer(0)));
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      failAll(new Error('归档已关闭'));
      worker.terminate();
    },
  };
}
