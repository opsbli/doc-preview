import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('framework entries export documented request types', async () => {
  const requiredTypes = [
    'RequestInitFactory',
    'RequestHandler',
    'RequestOptions',
    'Fetcher',
    'ShouldFetchAsBlob',
  ];

  for (const entry of [
    'packages/react-file-preview/src/index.ts',
    'packages/vue-file-preview/src/index.ts',
  ]) {
    const source = await read(entry);
    for (const typeName of requiredTypes) {
      assert.match(source, new RegExp(`\\b${typeName}\\b`), `${entry} missing ${typeName}`);
    }
  }
});

test('file type detection covers documented representative formats', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { getFileType } = await import(coreUrl);
  const cases = {
    'photo.heic': 'image',
    'scan.tiff': 'image',
    'camera.nef': 'image',
    'slides.ppt': 'pptx',
    'book.azw3': 'mobi',
    'captions.ttml': 'subtitle',
    'model.glb': 'cad',
    'config.toml': 'text',
    'run.bat': 'text',
    'photo.tga': 'image',
    'library.jar': 'zip',
    'clip.wmv': 'video',
    'clip.rmvb': 'video',
    'clip.mpeg': 'video',
    'clip.swf': 'video',
  };

  for (const [name, expected] of Object.entries(cases)) {
    assert.equal(getFileType({ id: name, name, url: name, type: '' }), expected);
  }
});

test('TGA decoder handles uncompressed and RLE 24-bit images', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { decodeTgaImage } = await import(coreUrl);

  const header = (imageType, width, height, imageDescriptor) => [
    0, 0, imageType,
    0, 0, 0, 0, 0,
    0, 0, 0, 0,
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    24, imageDescriptor,
  ];

  // 未压缩真彩：bottom-left 原点，存储顺序为 底行(蓝,白) → 顶行(红,绿)
  const uncompressed = new Uint8Array([
    ...header(2, 2, 2, 0),
    255, 0, 0, 255, 255, 255, // 底行 BGR：蓝 / 白
    0, 0, 255, 0, 255, 0, // 顶行 BGR：红 / 绿
  ]);
  const decoded = decodeTgaImage(uncompressed.buffer);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(Array.from(decoded.rgba), [
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);

  // RLE 真彩：一个 RLE 包重复黑色 4 次
  const rle = new Uint8Array([
    ...header(10, 2, 2, 0x20),
    0x83, 0, 0, 0,
  ]);
  const decodedRle = decodeTgaImage(rle.buffer);
  assert.deepEqual(Array.from(decodedRle.rgba), [
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
  ]);
});

test('OLE compound document detection separates legacy binary Office files', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { isOleCompoundDocument } = await import(coreUrl);

  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]).buffer;
  assert.equal(isOleCompoundDocument(ole), true);

  // OOXML（.pptx）是 zip 容器，魔数为 PK\x03\x04，不应被误判
  const ooxml = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]).buffer;
  assert.equal(isOleCompoundDocument(ooxml), false);

  assert.equal(isOleCompoundDocument(new Uint8Array([0xd0, 0xcf]).buffer), false);
});

test('request factory merges headers and delegates to the handler', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { createFetcher } = await import(coreUrl);
  let received;
  const fetcher = createFetcher({
    requestInit: { headers: { Authorization: 'Bearer token', 'X-Shared': 'user' } },
    requestHandler: async (url, init) => {
      received = { url, init };
      return new Response('ok');
    },
  });

  await fetcher('/protected', { headers: { 'X-Shared': 'library' } });
  const headers = new Headers(received.init.headers);
  assert.equal(received.url, '/protected');
  assert.equal(headers.get('authorization'), 'Bearer token');
  assert.equal(headers.get('x-shared'), 'library');
});

test('both image renderers use worker-first decoding with fallback', async () => {
  for (const renderer of [
    'packages/react-file-preview/src/renderers/Image/index.tsx',
    'packages/vue-file-preview/src/renderers/Image/index.vue',
  ]) {
    const source = await read(renderer);
    assert.match(source, /shouldUseWorker\(mimeType\)/);
    assert.match(source, /decodeInWorker\(/);
    assert.match(source, /catch\s*\{/);
    assert.match(source, /loader(?:\.decode|Cache\.decode)\(/);
  }
});

test('root READMEs contain only current scripts, links, and renderer contract', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    const source = await read(readme);
    assert.doesNotMatch(source, /supported-formats/);
    assert.doesNotMatch(source, /\bcomponent:\s*(?:CustomRenderer|\(\{ url \}\))/);
    assert.match(source, /\brender:\s*/);

    for (const command of source.matchAll(/^pnpm ([\w:-]+)/gm)) {
      assert.ok(
        command[1] === 'install' || packageJson.scripts[command[1]],
        `${readme} references missing script ${command[1]}`,
      );
    }
  }
});

test('VitePress type documentation has one request section and current labels', async () => {
  const types = await read('packages/docs/api/types.md');
  assert.equal((types.match(/^## 请求与鉴权$/gm) ?? []).length, 1);
  assert.doesNotMatch(types, /v2\.0\+/);
  assert.doesNotMatch(await read('packages/docs/guide/custom-renderers.md'), /v2\.0\+/);
});
