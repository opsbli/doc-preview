// 导出类型定义
export type {
  PreviewFile,
  PreviewFileLink,
  PreviewFileInput,
  FileType,
  PreviewState,
  Theme,
  CustomRendererEventPayload,
  RequestHandler,
  RequestInitFactory,
  RequestOptions,
  Fetcher,
  ShouldFetchAsBlob,
} from './types';
export type {
  WatermarkConfig,
  WatermarkLayer,
  WatermarkMode,
  WatermarkPosition,
  SearchOptions,
  SearchResult,
  EncryptedFileState,
} from './types';

// 导出常量
export { SUPPORTED_FILE_TYPES } from './types';

// 导出文件标准化工具
export {
  normalizeFile,
  normalizeFiles,
  getFileNameFromUrl,
  inferMimeType,
} from './utils/fileNormalizer';

// 导出预览模式工具（关闭按钮默认显隐判定等）
export { resolveShowClose } from './utils/previewMode';
export type { PreviewMode } from './utils/previewMode';

// 导出文件类型识别 / 格式化工具
export {
  getFileType,
  getLanguageFromFileName,
  getVideoMimeType,
  formatFileSize,
  formatTime,
} from './utils/fileType';

// 导出 CSV/TSV 解析
export { parseCsv, guessCsvDelimiter } from './utils/csvParser';
export type { CsvParseOptions, CsvParseResult } from './utils/csvParser';

// 导出文本编码工具
export { decodeText, decodeUtf8, fetchTextUtf8 } from './utils/textDecoder';
export type { FetchTextOptions } from './utils/textDecoder';

// 导出请求/鉴权工具
export { createFetcher, fetchAsBlobUrl, downloadFileWithFetcher } from './utils/request';

// 导出水印归一化工具
export { resolveWatermarkLayers } from './utils/watermark';
export type { ResolvedWatermarkLayer } from './utils/watermark';

// 导出字幕 / 歌词解析
export { parseSubtitle, formatSubtitleTime } from './utils/subtitleParser';
export type {
  SubtitleCue,
  SubtitleWord,
  SubtitleParseResult,
  SubtitleFormat,
} from './utils/subtitleParser';

// 导出 ZIP 工具
export {
  loadZip,
  buildZipTree,
  readZipEntryText,
  readZipEntryBlob,
  ZipPasswordError,
  ZipInvalidPasswordError,
} from './utils/zipReader';
export type { ZipEntryInfo, ZipTreeNode, ZipHandle } from './utils/zipReader';

// 导出 Excel 数据转换
export { convertWorkbookToSpreadsheetData, convertCsvToSpreadsheetData } from './utils/excelDataConverter';
export type { XCellStyle, XCellData, XRowData, XSheetData } from './utils/excelDataConverter';

// 导出旧版二进制 Excel（.xls）数据转换
export { convertXlsToSpreadsheetData } from './utils/xlsDataConverter';

// 导出二进制容器探测（旧版 Office 二进制格式识别）
export { isOleCompoundDocument } from './utils/binaryFormat';

// 导出 TGA 图片解码（零依赖，浏览器 loader 与测试共用）
export { decodeTgaImage } from './utils/tgaDecoder';
export type { DecodedTgaImage } from './utils/tgaDecoder';

// 导出不受信任 HTML 清洗（邮件正文预览用）与 HTML 预预览预处理
export { sanitizeEmailHtml, prepareHtmlForSandbox } from './utils/htmlSanitize';

// 导出 EML 邮件解析
export { parseEml } from './utils/emlParser';
export type { ParsedEml, EmailAddress, EmailAttachment } from './utils/emlParser';

// 导出通用压缩包读取（tar / gzip / 7z / rar）
export { loadArchive, detectArchiveFormat } from './utils/archiveReader';
export type { ArchiveFormat, ArchiveHandle } from './utils/archiveReader';

// 导出 7z / rar 解压的纯逻辑层（供自定义渲染器与测试复用；不含 wasm 本体）
export { openSevenZipArchive, parseSevenZipListing } from './utils/sevenZipCore';
export type { SevenZipFactory, SevenZipModule, SevenZipSession } from './utils/sevenZipCore';

// 导出 XMind 思维导图解析
export { parseXmind, countMindmapNodes } from './utils/xmindParser';
export type { MindmapNode, MindmapSheet, ParsedXmind } from './utils/xmindParser';

// 导出 PDF.js Worker 配置
export { configurePdfWorker, getPdfDocumentOptions } from './utils/pdfWorker';
export type { PdfWorkerOptions, PdfDocumentOptions } from './utils/pdfWorker';

// 导出 Uint8Array hex/base64 polyfill（pdfjs 6.x 在 webpack/umi 环境下必需）
export { installUint8ArrayHexBase64Polyfill } from './utils/uint8ArrayPolyfill';

// 导出 i18n 国际化
export { createTranslator, builtInMessages } from './i18n';
export type {
  Locale,
  MessageKey,
  Messages,
  TranslateParams,
  Translator,
  CreateTranslatorOptions,
} from './i18n/types';

// 导出 MIME 类型工具
export {
  EXTENSION_TO_MIME,
  getMimeTypeFromExtension,
  getMimeTypeFromFileName,
  isAdvancedImageFormat,
  isRawFormat,
} from './utils/mimeTypes';

// 导出图片解码 loader 注册与调度
export {
  registerLoader,
  getLoader,
  hasLoader,
  getLoaderForMimeType,
  detectImageFormat,
} from './loaders/registry';
export type {
  ImageDecoder,
  DecodeOptions,
  ImageMetadata,
  LoaderRegistry,
} from './loaders/types';

// 导出耗时图片格式的 Worker 解码能力
export { shouldUseWorker, decodeInWorker } from './workers/workerClient';
