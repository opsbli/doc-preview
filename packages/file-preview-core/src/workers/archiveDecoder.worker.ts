/// <reference lib="webworker" />
/**
 * 7z / rar 解压 Web Worker
 *
 * 在 Worker 中运行 7z-wasm（Emscripten + 7-Zip 24.09），避免大包解压阻塞主线程。
 *
 * 消息协议：
 * - 接收 open：{ type: 'open', id, buffer: ArrayBuffer, fileName: string }
 * - 接收 read：{ type: 'read', id, path: string }
 * - 返回成功：{ type: 'done', id, entries?: ZipEntryInfo[], data?: ArrayBuffer }
 * - 返回失败：{ type: 'error', id, message: string }
 */
import SevenZip from '7z-wasm';
import { openSevenZipArchive, type SevenZipFactory, type SevenZipSession } from '../utils/sevenZipCore';
import type { ZipEntryInfo } from '../utils/zipReader';

declare const self: DedicatedWorkerGlobalScope;

interface OpenRequest {
  type: 'open';
  id: string;
  buffer: ArrayBuffer;
  fileName: string;
}

interface ReadRequest {
  type: 'read';
  id: string;
  path: string;
}

type WorkerRequest = OpenRequest | ReadRequest;

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

const sevenZipFactory = SevenZip as unknown as SevenZipFactory;

/** Worker 生命周期内只服务一个归档（客户端在切换文件时终止 Worker） */
let session: SevenZipSession | null = null;

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === 'open') {
      session?.dispose();
      session = null;
      // 不传 wasmBinary：打包时已把 7zz.wasm 内联为本 worker 内的 data URL
      session = await openSevenZipArchive(sevenZipFactory, request.buffer, request.fileName);
      const response: DoneResponse = { type: 'done', id: request.id, entries: session.entries };
      self.postMessage(response);
      return;
    }

    if (request.type === 'read') {
      if (!session) {
        throw new Error('归档尚未打开');
      }
      const data = await session.readFile(request.path);
      const response: DoneResponse = { type: 'done', id: request.id, data: data.buffer as ArrayBuffer };
      self.postMessage(response, [data.buffer as ArrayBuffer]);
      return;
    }
  } catch (error) {
    const response: ErrorResponse = { type: 'error', id: request.id, message: toMessage(error) };
    self.postMessage(response);
  }
};
