# 支持的文件类型

Doc Preview 支持多种常见文件格式，React 与 Vue 版本共享类型识别和解析核心，并提供等价的预览能力。

## 图片格式

支持所有浏览器原生支持的图片格式：

- **JPEG/JPG** - `.jpg`, `.jpeg`
- **PNG** - `.png`
- **GIF** - `.gif` (支持动画)
- **WebP** - `.webp`
- **SVG** - `.svg`
- **BMP** - `.bmp`
- **ICO** - `.ico`

### 特性

- 缩放和平移（范围 0.01x - 10x）
- 旋转（顺时针/逆时针 90°）
- 鼠标滚轮缩放
- 拖拽移动

### 高级图片格式

针对浏览器不原生支持的格式，库会自动按需动态加载内置的解码引擎，主 bundle 体积零增量；运行时仅在用户实际预览对应格式时才下载解码 chunk。

- **HEIC/HEIF** - `.heic`, `.heif`
  - Apple 设备（iPhone/iPad）从 iOS 11 起的默认照片格式
  - 解码引擎：`heic2any`（解码时间 0.5-2s，取决于分辨率）
  - 优先在 Web Worker 中解码；Worker、CSP 或第三方库不兼容时自动回退主线程
- **AVIF** - `.avif`
  - 现代高压缩比格式（比 JPEG 节省 ~50% 体积）
  - Chrome 85+、Firefox 93+、Safari 16+ 已原生支持，自动检测
  - 不支持时降级到 WASM 解码（`@jsquash/avif`）
- **TIFF** - `.tif`, `.tiff`
  - 常见于扫描文档、印刷预检
  - 解码引擎：`utif`
  - 支持多页 TIFF：底部出现「上一页 / 下一页」按钮
  - 内置 LRU 缓存（最多 10 页），翻页流畅
- **RAW 相机原始格式** - `.cr2`, `.nef`, `.arw`, `.dng`, `.raf`, `.orf`
  - 支持 Canon (CR2)、Nikon (NEF)、Sony (ARW)、Adobe (DNG)、Fujifilm (RAF)、Olympus (ORF)
  - 通过解析容器结构提取嵌入的 JPEG 预览图（零额外依赖，< 500ms）
  - 当前版本不进行完整像素级解码（受浏览器端 RAW 引擎成熟度限制）
- **PSD（Adobe Photoshop）** - `.psd`
  - 解码引擎：`ag-psd`
  - 仅展示合并图层后的最终效果，不解析图层结构
  - 带蒙版 / 调整图层的 PSD 显示可能与 Photoshop 略有差异
- **JPEG 2000** - `.jp2`, `.jpx`, `.j2k`
  - Safari 原生支持，其他浏览器通过 WASM 解码（`@jsquash/jpeg2000`）
  - 常见于医学影像、地图瓦片
- **TGA（Truevision Targa）** - `.tga`
  - 常见于游戏贴图与 3D 纹理
  - 纯 TypeScript 解码（未压缩与 RLE，8/16/24/32bpp，含调色板，支持上下/左右原点），不引入额外依赖

#### 浏览器兼容性

| 格式 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| HEIC/HEIF | WASM | WASM | WASM | WASM |
| AVIF | 原生 (85+) | 原生 (93+) | 原生 (16+) | 原生 (90+) |
| TIFF | WASM | WASM | 部分原生 | WASM |
| RAW | 嵌入预览 | 嵌入预览 | 嵌入预览 | 嵌入预览 |
| PSD | WASM | WASM | WASM | WASM |
| JPEG 2000 | WASM | WASM | 原生 | WASM |
| TGA | JS 解码 | JS 解码 | JS 解码 | JS 解码 |

#### 性能特征

- HEIC/RAW/PSD 优先在 Web Worker 中解码，失败时回退主线程
- TIFF/AVIF 在主线程解码；耗时取决于文件大小、设备和浏览器
- 所有解码引擎通过动态 `import()` 按需加载，未使用的格式不会进入首屏 chunk
- 解码失败时显示友好提示

## 视频格式

支持 HTML5 视频格式：

- **MP4** - `.mp4`
- **WebM** - `.webm`
- **OGG** - `.ogg`, `.ogv`
- **MOV** - `.mov`
- **M4V** - `.m4v`
- **3GP** - `.3gp`

### 特性

- 基于 Video.js 播放器

#### 容器兼容性说明

以下容器仍会被识别为视频类型，但浏览器原生无法播放（无论编码），组件会给出明确的「需转码」提示，不会静默失败：

`avi` `wmv` `asf` `rm` `rmvb` `mpeg` `mpg` `swf` `flv`，以及部分编码的 `.mkv`。

纯前端架构下无法转码，如需播放这些格式，请在服务端转为 MP4（H.264 + AAC）。
- 播放/暂停控制
- 音量调节
- 进度条
- 全屏播放

## 音频格式

支持 HTML5 音频格式：

- **MP3** - `.mp3`
- **WAV** - `.wav`
- **OGG** - `.ogg`
- **M4A** - `.m4a`
- **AAC** - `.aac`
- **FLAC** - `.flac`

### 特性

- 播放/暂停控制
- 音量调节
- 进度条
- 快进/快退（±10 秒）

## PDF 文档

- **PDF** - `.pdf`

### 特性

- 页面导航（上一页/下一页）
- 缩放控制（0.01x - 10x）
- 连续滚动浏览
- 页码显示

## Office 文档

### Word 文档

- **DOCX** - `.docx`

### Excel 表格

- **XLSX** - `.xlsx`（解析：exceljs）
- **XLSM** - `.xlsm`（宏不执行，仅预览内容；解析：exceljs）
- **XLS** - `.xls`（Office 97-2003 二进制，解析：SheetJS，按需加载 chunk）
  - 旧版 `.xls` 仅还原单元格文本、行列结构与合并区域；字体/底色/边框等样式仍由 OOXML 路径提供

### PowerPoint 演示文稿

- **PPTX** - `.pptx`
- **PPT** - `.ppt`

### 特性

- 保留原始格式
- 支持图片和表格
- 响应式布局
- 显示所有工作表（Excel）
- 平铺/幻灯片两种显示模式（PowerPoint，16:9 宽高比）

## 邮件

### Outlook 邮件（MSG）

- **MSG** - `.msg`

### EML 邮件

- **EML** - `.eml`（RFC 822 / MIME）

### 特性

- 解析邮件头信息（发件人、收件人、抄送、主题、日期、Message-ID）
- 邮件正文渲染（HTML 正文经尽力而为的清洗后展示：移除 script/iframe 等元素、on* 事件属性与危险协议链接）
- `cid:` 内联图片自动替换为可渲染的 blob URL
- 附件列表展示

## 电子书

### EPUB

- **EPUB** - `.epub`

#### 特性

- 基于 foliate-js 渲染，零外部 CDN 依赖
- 章节导航（目录侧栏）
- 左右翻页（按钮 / 键盘方向键）
- 章节自动分页与页码显示
- 全屏宽度 / 阅读宽度切换
- 自适应屏幕宽度

### MOBI / AZW / KF8

- **MOBI** - `.mobi`
- **AZW / AZW3** - `.azw`, `.azw3`
- **KF8** - `.kf8`

#### 特性

- 基于 foliate-js 解析与渲染（与 EPUB 共用底层）
- 与 EPUB 一致的翻页 / 目录 / 全屏宽度交互
- 不支持 DRM 保护文件，遇到 DRM 会给出明确提示

## 字体文件

- **TrueType** - `.ttf`
- **OpenType** - `.otf`
- **WOFF** - `.woff`
- **WOFF2** - `.woff2`

### 特性

- 基于 opentype.js 解析字体内部结构
- 展示完整元数据：字体家族、子系列、版本、设计师、字形数量、格式
- 多字号梯度展示（72 / 48 / 36 / 24 / 18 px）
- 自定义文本输入框，实时预览效果
- 内置拉丁字母与中文常用字字符集样例
- 双渲染策略
  - 优先使用浏览器原生 FontFace API（性能最佳）
  - 浏览器 OTS（OpenType Sanitizer）拒绝时自动降级到 Canvas 软渲染（opentype.js 容忍度更高，可显示部分浏览器原生不接受的字体）
- 容器宽度固定，长文本自动按容器宽度断行

## CAD / 3D 模型

- **DXF** - `.dxf` (AutoCAD 2D 图纸交换格式)
- **STL** - `.stl` (3D 打印标准格式，支持 ASCII 和二进制)
- **OBJ** - `.obj` (Wavefront 3D 模型)
- **GLTF** - `.gltf` (现代 Web 3D 格式，JSON 描述)
- **GLB** - `.glb` (GLTF 二进制版本)
- **PLY** - `.ply` (多边形网格，支持 ASCII / 二进制)
- **FBX** - `.fbx` (Autodesk 交换格式)
- **DAE** - `.dae` (COLLADA，仅按内嵌材质渲染，外部纹理引用无法解析)
- **3MF** - `.3mf` (3D Manufacturing Format)
- **AMF** - `.amf` (Additive Manufacturing File)
- **WRL** - `.wrl` (VRML；其解析器体积较大，仅在预览 wrl 时动态加载)

未支持的 3D / 工程格式：`3ds`、`off`、`step`、`iges`、`ifc`、`brep`、`bim`、`fcstd`
（three.js 无对应 loader；工程 CAD 类格式在纯前端不具备可行路径）。

### 特性

- 基于 Three.js 的硬件加速 3D 渲染引擎
- 交互式 3D 视图
  - 左键拖动：旋转视角
  - 右键拖动：平移视图
  - 滚轮：缩放
- 工具栏功能
  - 视图重置：恢复初始视角
  - 线框/实体切换：切换渲染模式
  - 网格显示/隐藏：辅助参考网格
  - 坐标轴显示/隐藏：XYZ 方向指示
- 自动视角调整：模型自动居中并缩放至合适大小
- 默认材质与光照
  - 环境光 + 双向定向光
  - 灰色 Phong 材质（双面渲染）
- 性能优化
  - 直接从 File 对象读取（无 blob URL 中间层）
  - 支持大型模型（百万级三角形）
  - 自动内存清理

## Markdown 文档

- **Markdown** - `.md`, `.markdown`

### 特性

- GitHub Flavored Markdown (GFM) 支持
- 代码语法高亮
- 表格支持
- 任务列表
- 自动链接

## HTML 文档

- **HTML** - `.html`, `.htm`, `.xhtml`

### 特性

- **预览模式（默认）**：以 `<iframe sandbox="">` 通过 `srcDoc` 承载文档（静态安全预览）
  - 不带 `allow-scripts`：页面内脚本**一律不执行**
  - 不带 `allow-same-origin`：与宿主页面不同源，无法访问宿主 cookie / storage
  - 预览前会移除 `<base>` 与 `<meta http-equiv="refresh">`（避免改写基准路径与自动跳转）
  - 代价：依赖脚本才能渲染的页面不会完整还原
- **源码模式**：工具栏可切换，显示带高亮的源码

## 代码文件

支持 40+ 种编程语言的语法高亮：

- **JavaScript/TypeScript** - `.js`, `.jsx`, `.ts`, `.tsx`
- **Python** - `.py`
- **Java** - `.java`
- **C/C++** - `.c`, `.cpp`, `.h`
- **C#** - `.cs`
- **Go** - `.go`, `.mod`
- **Rust** - `.rs`
- **Lua** - `.lua`
- **Vim Script** - `.vim`
- **PHP** - `.php`
- **Ruby** - `.rb`
- **Swift** - `.swift`
- **Kotlin** - `.kt`
- **HTML** - `.html`
- **CSS/SCSS/Sass/Less** - `.css`, `.scss`, `.sass`, `.less`
- **前端框架组件** - `.vue`, `.svelte`（shiki 高亮 template / script / style 分区）
- **YAML** - `.yaml`, `.yml`
- **TOML** - `.toml`
- **INI** - `.ini`, `.conf`, `.env`
- **Lock 文件** - `.lock`
- **Diff/Patch** - `.diff`, `.patch`
- **Shell** - `.sh`, `.bash`, `.zsh`
- **Batch** - `.bat`（Windows 批处理脚本，shiki 高亮）
- **SQL** - `.sql`
- **Log** - `.log`

### 特性

- 语法高亮（VS Code Dark+ 主题）
- 自动语言检测
- 行号显示

## CSV / TSV 表格

- **CSV** - `.csv`
- **TSV** - `.tsv`

### 特性

- 纯前端解析，无第三方依赖
- 支持 RFC 4180 双引号转义与字段内换行
- 表格式渲染，首行自动识别为表头
- 显示行数/列数统计

## XML

- **XML** - `.xml`

### 特性

- 使用浏览器原生 `DOMParser` 做格式校验
- 自动缩进美化
- 语法高亮

## 字幕 / 歌词文件

- **SRT** - `.srt`
- **WebVTT** - `.vtt`
- **LRC** - `.lrc`（基础歌词，`[mm:ss.xx]` 行时间戳，支持 `[ti:][ar:][al:]` 等元数据）
- **Enhanced LRC** - `.elrc`（增强歌词，行内 `<mm:ss.xx>` 逐字时间戳）
- **ASS / SSA** - `.ass` / `.ssa`（Advanced SubStation Alpha，自动剥离 `\N` `\h` 与 `{...}` 样式覆盖码）
- **TTML / DFXP** - `.ttml` / `.dfxp`（W3C / Apple Music 使用的 XML 字幕，支持 `begin` / `end` / `dur` 与 `<br/>`）

### 特性

- 纯前端解析，零第三方依赖
- 自动按内容/扩展名识别格式
- 结构化 cue 列表展示（索引、时间区间、文本）
- LRC / ELRC 自动展示元数据（标题 / 艺术家 / 专辑 / 偏移……）
- ELRC 逐字时间戳以词条形式排列展示
- ASS / SSA 同步显示 Style 标签，自动应用 `offset` 偏移

## JSON / JSONC

- **JSON** - `.json`
- **JSONC (JSON with Comments)** - `.jsonc`

### 特性

- 自动格式化缩进
- 语法高亮
- **支持注释**（JSONC）
  - 单行注释 `//`
  - 多行注释 `/* */`
  - 行尾注释
  - 基于 `jsonc-parser`（Microsoft 官方，VSCode 同款）

## 压缩包

- **ZIP** - `.zip`
- **JAR** - `.jar`（本质为 ZIP，复用 ZIP 渲染器）
- **TAR** - `.tar`
- **TAR.GZ / TGZ / GZ** - `.tar.gz`, `.tgz`, `.gz`（单文件 `.gz` 会解出唯一文件）
- **7Z** - `.7z`
- **RAR** - `.rar`（含 RAR5，只读）

### 特性

- ZIP 基于 @zip.js/zip.js 解析压缩包目录结构，**支持加密 ZIP**（传统 ZipCrypto / AES，自动弹出密码输入框，错误密码可重试 3 次）
- TAR 由内置解析器处理（ustar / GNU longname / PAX 扩展头 / base-256 数值），GZIP 由 fflate 按需加载解压
- 7Z / RAR 在 **Web Worker** 中经 7z-wasm（7-Zip 24.09 的 WASM 构建）解压，不阻塞主线程；wasm 已内联进按需 chunk，使用方无需额外部署静态资源
- 左侧条目列表 + 右侧内嵌预览
- 内嵌预览任意受支持的格式（文本、代码、图片、Office 等），条目较多时仅渲染前 2000 项
- 受限项：加密 7z 归档（需要密码）不在支持范围内；RAR 仅支持解压读取

### 体积与第三方许可

7Z / RAR 能力对应的 chunk 约 3.0MB（gzip 后约 1.24MB），**仅在使用方预览 7z / rar 时下载**，不影响首屏。
该 chunk 内嵌 7z-wasm（7-Zip 24.09），采用 **GNU LGPL-2.1-or-later + unRAR restriction**，
许可声明见仓库根 `NOTICE` 与 `packages/file-preview-core/NOTICE`，许可全文见
`packages/file-preview-core/licenses/`。

## 纯文本

- **TXT** - `.txt`
- 其他未识别的文本文件

## 思维导图（XMind）

- **XMind** - `.xmind`

### 特性

- 本体为 ZIP 容器：新版读取 `content.json`，旧版（XMind 8）读取 `content.xml`
- 多画布（sheet）切换
- 可折叠主题树，支持「全部展开 / 全部折叠」
- 展示主题标签与备注

## BPMN 流程图

- **BPMN** - `.bpmn`（BPMN 2.0 流程定义）

### 特性

- 基于 bpmn-js Viewer 渲染（动态加载独立 chunk，仅在使用时下载）
- 导入后自动适配画布尺寸
- 需要文件包含 BPMN DI（图形信息）才能渲染图形

## 不支持的格式

对于不支持的文件格式，组件会显示一个友好的提示界面，包含：

- 文件名和大小
- 下载按钮
- 文件类型说明

### 能力边界（纯前端架构限制）

本库是**纯浏览器内**组件库，不具备服务端转换能力（LibreOffice / ImageMagick / FFmpeg 等）。以下格式因此明确不支持，不会以「看似支持」的形式出现：

| 格式 | 原因 |
|---|---|
| `doc`、`ppt`（Office 97-2003 二进制） | 前端无可靠解析器；`.ppt` 会检测 OLE 复合文档头并给出「另存为 .pptx」的明确提示 |
| `wps`、`dps`、`et`、`ett`、`wpt` | WPS 私有/二进制格式，无前端解析方案 |
| `odt`、`odp`、`ott`、`otp`、`fodt`、`fods` | 除 `ods` 外前端均不可行；本版本未接入 ODF |
| `dotm`、`dot`、`dotx`、`xlt`、`xltm`、`xlam`、`xla` | Office 模板/宏格式，需旧版二进制解析 |
| `vsd`、`vsdx` | 需自研 OPC 图形渲染，成本极高 |
| `wmf`、`emf` | Windows 矢量图元文件，浏览器无渲染器 |
| `dwg` | 需 WASM 或服务端转换 |
| `ofd`、`rtf`、`drawio`、`dcm` | 尚未接入（均具备前端可行路径，见后续规划） |
| `wmv`、`rm`、`rmvb`、`mpeg`、`mpg`、`swf`、`avi`、`flv` | 浏览器无法解码，需服务端转码 |

## 文件类型检测

组件会按以下优先级检测文件类型：

1. **MIME 类型**：如果提供了 `type` 属性，优先使用
2. **文件扩展名**：从文件名自动推断 MIME 类型
3. **默认类型**：无法识别时标记为 `unsupported`

支持的文件类型枚举：

- `image` - 图片文件
- `pdf` - PDF 文档
- `docx` - Word 文档
- `xlsx` - Excel 表格
- `pptx` - PowerPoint 演示文稿
- `msg` - Outlook 邮件
- `epub` - EPUB 电子书
- `mobi` - MOBI / AZW / AZW3 / KF8 电子书
- `video` - 视频文件
- `audio` - 音频文件
- `markdown` - Markdown 文件
- `html` - HTML 文档（沙箱预览 / 源码）
- `json` - JSON / JSONC 文件
- `csv` - CSV/TSV 文件
- `xml` - XML 文件
- `subtitle` - SRT / VTT / LRC / ELRC / ASS / SSA / TTML 字幕与歌词文件
- `zip` - ZIP 压缩包
- `archive` - TAR / TAR.GZ / TGZ / GZ / 7Z / RAR 压缩包
- `mindmap` - XMind 思维导图
- `bpmn` - BPMN 2.0 流程图
- `eml` - RFC 822 / MIME 邮件
- `text` - 其他文本和代码文件
- `font` - 字体文件（TTF / OTF / WOFF / WOFF2）
- `cad` - CAD / 3D 模型（DXF / STL / OBJ / GLTF / GLB）
- `unsupported` - 不支持的类型
