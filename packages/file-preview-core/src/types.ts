// 链接对象类型
export interface PreviewFileLink {
  id?: string;
  name: string;
  url: string;
  type: string;
  size?: number;
}

// 内部使用的标准化文件类型
export interface PreviewFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  file?: File; // 保留原始 File 对象（如果是从 File 对象创建的）
}

// 支持 File 对象、链接对象或 HTTP URL 字符串
export type PreviewFileInput = File | PreviewFileLink | string;

export type FileType =
  | 'image'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'msg'
  | 'epub'
  | 'mobi'
  | 'video'
  | 'audio'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'xml'
  | 'subtitle'
  | 'zip'
  | 'text'
  | 'font'
  | 'cad'
  | 'unsupported';

/**
 * 支持的文件类型列表（不包括 'unsupported'）
 */
export const SUPPORTED_FILE_TYPES: Exclude<FileType, 'unsupported'>[] = [
  'image',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'msg',
  'epub',
  'mobi',
  'video',
  'audio',
  'markdown',
  'json',
  'csv',
  'xml',
  'subtitle',
  'zip',
  'text',
  'font',
  'cad',
] as const;

export interface PreviewState {
  zoom: number;
  rotation: number;
  currentPage: number;
  totalPages: number;
}

export type Theme = 'auto' | 'dark' | 'light';

// 自定义渲染器事件载荷（框架无关，React / Vue 两端共用）
export interface CustomRendererEventPayload<T = unknown> {
  name: string;
  payload?: T;
  file: PreviewFile;
}

/**
 * 自定义请求处理器：完全接管 URL 的请求过程。
 * 用于鉴权 URL 等场景（注入 Authorization、Cookie、签名头等）。
 * 接收已合并好的 RequestInit，需返回标准 Response。
 */
export type RequestHandler = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * RequestInit 工厂：可以是固定对象，也可以根据 url 异步推导。
 * 与库内调用方传入的 init 合并（库内 init 优先，用户 factory 兜底）。
 */
export type RequestInitFactory =
  | RequestInit
  | ((url: string) => RequestInit | Promise<RequestInit>);

/**
 * 顶层请求选项：requestInit 与 requestHandler 同时存在时，handler 接收已合并的 init。
 */
export interface RequestOptions {
  requestInit?: RequestInitFactory;
  requestHandler?: RequestHandler;
}

/**
 * 与原生 fetch 同签名的请求函数。库内所有 fetch 调用经它发出。
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * 是否对该文件先 fetch 成 Blob 再生成 blob: URL 喂给底层渲染器。
 * 命中后所有 src 类（image/video/audio/pdf）都走 fetcher，能复用鉴权头。
 */
export type ShouldFetchAsBlob = (file: PreviewFile) => boolean;

// ──────────────────────────────────────────────
// 水印配置
// ──────────────────────────────────────────────

export type WatermarkMode = 'text' | 'image' | 'both';

export type WatermarkPosition = 'tile' | 'center' | 'diagonal';

/** 图片+文字组合布局：图左文右（horizontal，默认）或图上文下（vertical） */
export type WatermarkLayout = 'horizontal' | 'vertical';

/**
 * 单个水印层（layers 模式），每层独立配置
 */
export interface WatermarkLayer {
  /** 层类型：文字 / 图片 / 图片+文字组合 */
  type: WatermarkMode;
  /** 文字水印内容（type='text' 或 type='both' 时使用），支持 {username} {time} 占位符 */
  text?: string;
  /** 图片水印 URL（type='image' 或 type='both' 时使用） */
  imageUrl?: string;
  /** 图片+文字组合布局，默认 'horizontal'（图左文右） */
  layout?: WatermarkLayout;
  /** 图片与文字的间距（px），默认 8 */
  gap?: number;
  /** 文字字体，默认 '14px sans-serif' */
  font?: string;
  /** 文字颜色，默认主题自适应（dark 白 / light 黑） */
  color?: string;
  /** 图片水印单元尺寸 [宽, 高]，默认 [80, 80]；按图片原始比例等比缩放（contain） */
  imageSize?: [number, number];
  /** 透明度 0-1，默认 0.35 */
  opacity?: number;
  /** 旋转角度（度），默认 -30 */
  rotation?: number;
  /** 水平/垂直间距 [x, y]（px），默认 [200, 150] */
  spacing?: [number, number];
  /** 布局方式，默认 'tile' */
  position?: WatermarkPosition;
}

/**
 * 水印配置
 */
export interface WatermarkConfig {
  /** 水印模式：文字 / 图片 / 图片+文字 */
  mode: WatermarkMode;
  /** 多层水印叠加（每层独立配置，数组顺序即绘制顺序）。传入时忽略顶层 mode 单层字段 */
  layers?: WatermarkLayer[];
  /** 文字水印内容（mode='text' 或 mode='both' 时使用），支持 {username} {time} 占位符 */
  text?: string;
  /** 文字字体，默认 '14px sans-serif' */
  font?: string;
  /** 文字颜色，默认主题自适应（dark 白 / light 黑） */
  color?: string;
  /** 图片水印 URL（mode='image' 或 mode='both' 时使用） */
  imageUrl?: string;
  /** 图片+文字组合布局，默认 'horizontal'（图左文右） */
  layout?: WatermarkLayout;
  /** 图片与文字的间距（px），默认 8 */
  gap?: number;
  /** 图片水印单元尺寸 [宽, 高]，默认 [80, 80]；按图片原始比例等比缩放（contain） */
  imageSize?: [number, number];
  /** 透明度 0-1，默认 0.35 */
  opacity?: number;
  /** 旋转角度（度），默认 -30 */
  rotation?: number;
  /** 水平/垂直间距 [x, y]（px），默认 [200, 150] */
  spacing?: [number, number];
  /** 布局方式，默认 'tile' */
  position?: WatermarkPosition;
  /** 层级，默认 5 */
  zIndex?: number;
}

// ──────────────────────────────────────────────
// 搜索相关类型
// ──────────────────────────────────────────────

/**
 * 搜索选项
 */
export interface SearchOptions {
  /** 是否区分大小写，默认 false */
  caseSensitive?: boolean;
  /** 是否搜索所有页面（PDF），默认 false（仅搜索已渲染页面） */
  allPages?: boolean;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 总匹配数 */
  total: number;
  /** 当前匹配索引（从 0 开始） */
  current: number;
  /** 所有匹配的索引列表 */
  matches: number[];
}

// ──────────────────────────────────────────────
// 加密文件相关类型
// ──────────────────────────────────────────────

/**
 * 加密文件状态
 */
export interface EncryptedFileState {
  /** 是否需要密码 */
  needsPassword: boolean;
  /** 错误信息 */
  error?: string;
  /** 已重试次数 */
  retries: number;
}
