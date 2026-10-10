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
    'plan.xmind': 'mindmap',
    'mail.eml': 'eml',
    'pkg.tar': 'archive',
    'pkg.tar.gz': 'archive',
    'pkg.tgz': 'archive',
    'pkg.7z': 'archive',
    'pkg.rar': 'archive',
    'process.bpmn': 'bpmn',
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

const CRC32_TABLE = new Int32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value;
});

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

/** 构造只含 stored 条目的最小 ZIP 容器（用于造 .xmind 测试夹具） */
function makeZip(files) {
  const encoder = new TextEncoder();
  const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
  const u32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

  const parts = [];
  const centralEntries = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);

    const localHeader = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(checksum), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0),
    ]);

    centralEntries.push({
      header: new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(checksum), ...u32(data.length), ...u32(data.length),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(offset),
      ]),
      nameBytes,
    });

    parts.push(localHeader, nameBytes, data);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const entry of centralEntries) {
    parts.push(entry.header, entry.nameBytes);
    centralSize += entry.header.length + entry.nameBytes.length;
  }

  parts.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output.buffer;
}

test('xmind parser reads content.json topic tree from the zip container', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { parseXmind, countMindmapNodes } = await import(coreUrl);

  const content = JSON.stringify([
    {
      title: 'Sheet A',
      rootTopic: {
        title: 'Central',
        children: {
          attached: [
            { title: 'Branch 1', labels: ['urgent'] },
            { title: 'Branch 2', notes: { plain: { content: 'note text' } } },
          ],
        },
      },
    },
  ]);

  const parsed = await parseXmind(makeZip([{ name: 'content.json', content }]));
  assert.equal(parsed.sheets.length, 1);
  assert.equal(parsed.sheets[0].title, 'Sheet A');
  assert.equal(parsed.sheets[0].root.title, 'Central');
  assert.deepEqual(parsed.sheets[0].root.children.map((child) => child.title), ['Branch 1', 'Branch 2']);
  assert.deepEqual(parsed.sheets[0].root.children[0].labels, ['urgent']);
  assert.equal(parsed.sheets[0].root.children[1].notes, 'note text');
  assert.equal(countMindmapNodes(parsed.sheets[0].root), 3);

  await assert.rejects(
    () => parseXmind(makeZip([{ name: 'metadata.json', content: '{}' }])),
    /content\.json/,
  );
});

test('eml parser normalizes headers, body and attachments', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { parseEml } = await import(coreUrl);

  const raw = [
    'From: Alice <alice@example.com>',
    'To: Bob <bob@example.com>',
    'Subject: Hello',
    'Date: Sat, 10 Oct 2026 10:00:00 +0800',
    'Message-ID: <abc@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="BOUND"',
    '',
    '--BOUND',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hi</p><script>alert(1)</script>',
    '--BOUND',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Disposition: attachment; filename="a.txt"',
    '',
    'hello file',
    '--BOUND--',
    '',
  ].join('\r\n');

  const parsed = await parseEml(raw);
  assert.equal(parsed.subject, 'Hello');
  assert.deepEqual(parsed.from, [{ name: 'Alice', address: 'alice@example.com' }]);
  assert.equal(parsed.to[0].address, 'bob@example.com');
  assert.equal(parsed.messageId, '<abc@example.com>');
  assert.match(parsed.html ?? '', /<p>Hi<\/p>/);
  assert.doesNotMatch(parsed.html ?? '', /<script/i);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].filename, 'a.txt');
  assert.equal(parsed.attachments[0].size, 10);
});

test('email html sanitizer removes scripts, handlers and dangerous urls', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { sanitizeEmailHtml } = await import(coreUrl);

  const dirty = [
    '<div onclick="steal()">ok</div>',
    '<img src="x.png" onerror="steal()">',
    '<a href="javascript:steal()">link</a>',
    '<a href="https://example.com">safe</a>',
    '<iframe src="https://evil.test"></iframe>',
    '<script>steal()</script>',
  ].join('');

  const clean = sanitizeEmailHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /onclick/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.match(clean, /<a href="https:\/\/example\.com">safe<\/a>/);
  assert.match(clean, /<div>ok<\/div>/);
});

/** 构造 tar 归档（ustar，仅普通文件与目录） */
function makeTar(files) {
  const encoder = new TextEncoder();
  const writeOctal = (block, offset, length, value) => {
    block.set(encoder.encode(value.toString(8).padStart(length - 1, '0')), offset);
    block[offset + length - 1] = 0;
  };

  const parts = [];
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.dir ? new Uint8Array(0) : encoder.encode(file.data ?? '');
    const header = new Uint8Array(512);
    header.set(nameBytes.subarray(0, 100), 0);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, data.length);
    writeOctal(header, 136, 12, 0);
    header[156] = file.dir ? 0x35 : 0x30;
    header.set(encoder.encode('ustar'), 257);
    header[263] = 0x30;
    header[264] = 0x30;
    for (let i = 148; i < 156; i++) header[i] = 0x20;
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.set(encoder.encode(checksum.toString(8).padStart(6, '0')), 148);
    header[154] = 0;
    header[155] = 0x20;

    parts.push(header);
    if (data.length > 0) {
      parts.push(data);
      const padding = (512 - (data.length % 512)) % 512;
      if (padding > 0) parts.push(new Uint8Array(padding));
    }
  }
  parts.push(new Uint8Array(1024));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

test('archive reader covers tar, tar.gz and single-file gzip', async () => {
  const zlib = await import('node:zlib');
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { loadArchive } = await import(coreUrl);

  const tarBytes = makeTar([
    { name: 'dir/', dir: true },
    { name: 'dir/inner.txt', data: 'inner' },
    { name: 'readme.txt', data: 'hello world' },
  ]);

  const tarHandle = await loadArchive(tarBytes.buffer, 'pkg.tar');
  assert.equal(tarHandle.format, 'tar');
  assert.deepEqual(
    tarHandle.entries.map((entry) => `${entry.isDir ? 'd' : 'f'}:${entry.path}`),
    ['d:dir/', 'f:dir/inner.txt', 'f:readme.txt'],
  );
  assert.equal(await tarHandle.readText('readme.txt'), 'hello world');
  assert.equal(tarHandle.entries.find((entry) => entry.path === 'dir/inner.txt').dir, 'dir');

  // tar.gz：先 gunzip 再按 tar 解析
  const tarGz = new Uint8Array(zlib.gzipSync(Buffer.from(tarBytes)));
  const tarGzHandle = await loadArchive(tarGz.buffer, 'pkg.tar.gz');
  assert.equal(tarGzHandle.entries.length, 3);
  assert.equal(await tarGzHandle.readText('dir/inner.txt'), 'inner');

  // 单文件 gzip：以去掉 .gz 的文件名作为唯一条目
  const soloGz = new Uint8Array(zlib.gzipSync(Buffer.from('plain text')));
  const soloHandle = await loadArchive(soloGz.buffer, 'note.txt.gz');
  assert.equal(soloHandle.entries.length, 1);
  assert.equal(soloHandle.entries[0].name, 'note.txt');
  assert.equal(await soloHandle.readText('note.txt'), 'plain text');
});

test('archive reader rejects 7z/rar with an explicit message', async () => {
  const coreUrl = pathToFileURL(path.join(root, 'packages/file-preview-core/lib/index.mjs')).href;
  const { loadArchive } = await import(coreUrl);

  await assert.rejects(() => loadArchive(new Uint8Array(32).buffer, 'pkg.7z'), /WASM/);
  await assert.rejects(() => loadArchive(new Uint8Array(32).buffer, 'pkg.rar'), /WASM/);
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
