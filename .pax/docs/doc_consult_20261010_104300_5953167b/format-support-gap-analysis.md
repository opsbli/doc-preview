# doc-preview 文件预览格式支持调研 · 对标 kkFileView 缺口分析

- 任务类型：`doc_consult`（纯调研 / 对标 / 规划）
- 编排快照：`.pax/plan/doc_consult_20261010_104300_5953167b/pax-snapshot.yaml`
- 生成时间：2026-10-10 10:43 (GMT+8)
- 对标来源：<https://www.kkview.cn/zh-cn/docs/home.html>（kkFileView 官方文档「概述」页，2026-10-10 抓取）
- 结论性质：调研结论 + 待决策建议，**未获授权前不产生任何代码变更**

---

## 一、结论摘要

1. **doc-preview 当前覆盖 19 类内置渲染器**（图片 / PDF / DOCX / XLSX / PPTX / MSG / EPUB / MOBI / 视频 / 音频 / Markdown / JSON / CSV / XML / 字幕 / ZIP / 文本代码 / 字体 / CAD-3D），格式识别同时支持 MIME、扩展名与文件头魔数三级探测。
2. **双方定位不同，直接对比会失真**：kkFileView 是 Spring Boot 服务端方案，依赖 LibreOffice / ImageMagick / FFmpeg 等服务端转换链路；doc-preview 是**纯浏览器内组件库**，没有服务端。因此 kkFileView 支持的许多格式（二进制 Office、Visio、WMF/EMF、RM/RMVB/WMV 转码）在纯前端架构下**本质不可实现或以高成本为代价**。
3. **doc-preview 在若干方向领先**：HEIC/AVIF/RAW/JPEG 2000 图片、MSG 邮件、MOBI/AZW 电子书、字体文件、字幕歌词（SRT/VTT/LRC/ASS/TTML）、JSONC，均为 kkFileView 未列出或覆盖更弱的能力。
4. **真正值得补的「常用缺口」集中在 6 个方向**：EML 邮件、旧版 XLS、多格式压缩包（7z/rar/tar/gz）、BPMN 流程图、XMind 思维导图、OFD 版式文档。
5. **存在一处「名义支持、实际不可用」的缺陷**：`.ppt` 被映射到 `pptx` 渲染器，而 `pptx-preview` 只能解析 OOXML，二进制 `.ppt` 必然解析失败。

---

## 二、doc-preview 现状（已支持格式）

### 2.1 渲染器注册表

证据：`packages/react-file-preview/src/renderers/registry.tsx`（`BUILTIN_RENDERERS`）

`image`、`pdf`、`docx`、`xlsx`、`pptx`、`msg`、`epub`、`mobi`、`video`、`audio`、`markdown`、`json`、`csv`、`xml`、`subtitle`、`zip`、`text`、`font`、`cad`，外加 `unsupported` 兜底。

### 2.2 扩展名与解析库明细

证据：`packages/file-preview-core/src/utils/fileType.ts`、`packages/file-preview-core/src/utils/mimeTypes.ts`、`packages/file-preview-core/src/loaders/registry.ts`、各渲染器源码与 `package.json`。

| 类别 | 扩展名 | 解析/渲染依赖 |
|---|---|---|
| 图片（原生） | `jpg` `jpeg` `png` `gif` `webp` `svg` `bmp` `ico` | 浏览器原生 |
| 图片（高级，按需动态 import） | `heic` `heif` / `avif` / `tif` `tiff` / `psd` / `jp2` `jpx` `j2k` / RAW：`cr2` `nef` `arw` `dng` `raf` `orf` | `heic2any`、`@jsquash/avif`、`utif`、`ag-psd`、`jpeg2000` + `@cornerstonejs/codec-openjpeg`；RAW 走容器内嵌预览图提取 |
| PDF | `pdf` | `pdfjs-dist` 6.1.200 |
| Word | `docx` | `mammoth` |
| Excel | `xlsx` | `exceljs` + `x-data-spreadsheet` |
| PowerPoint | `pptx`、`ppt`（见 §5 缺陷） | `pptx-preview` |
| 邮件 | `msg` | `@kenjiuno/msgreader` |
| 电子书 | `epub` | `foliate-js` / `@likecoin/epub-ts` |
| 电子书 | `mobi` `azw` `azw3` `kf8` | `foliate-js`（无 DRM） |
| 视频 | `mp4` `webm` `ogg` `ogv` `mov` `avi` `mkv` `m4v` `3gp` `flv` | `video.js`（`avi`/`wmv`/`flv` 实际被短路为「浏览器不支持」提示） |
| 音频 | `mp3` `wav` `ogg` `m4a` `flac` `aac` | 浏览器原生 + 自研播放器 |
| Markdown | `md` `markdown` | React: `react-markdown` + `remark-gfm/math` + `rehype-katex/raw`；Vue: `markdown-it` + katex；`shiki` 高亮 |
| JSON | `json` `jsonc` | `jsonc-parser` |
| 表格 | `csv` `tsv` | 自研解析（RFC 4180） |
| XML | `xml` | 原生 `DOMParser` + 美化 + 高亮 |
| 字幕/歌词 | `srt` `vtt` `lrc` `elrc` `ass` `ssa` `ttml` `dfxp` | 自研 `subtitleParser` |
| 压缩包 | `zip`（含加密 ZipCrypto/AES） | `@zip.js/zip.js` |
| 字体 | `ttf` `otf` `woff` `woff2` | `opentype.js`（WOFF2 走浏览器原生渲染） |
| CAD / 3D | `dxf` `stl` `obj` `gltf` `glb` | `three` + `three-dxf-loader` + STL/OBJ/GLTF Loader |
| 文本/代码 | `txt` `log` `lock`、`js` `jsx` `ts` `tsx` `cjs` `mjs` `cts` `mts`、`py` `java` `cpp` `c` `h` `cs` `php` `rb` `go` `mod` `rs` `swift` `kt` `lua` `vim`、`html` `css` `scss` `sass` `less` `vue` `svelte`、`yaml` `yml` `toml` `ini` `conf` `env`、`diff` `patch`、`sh` `bash` `zsh` `bat` `sql`，以及 `.gitignore` `.prettierrc` `.env*` 等点开头配置文件 | `shiki` 高亮 |

### 2.3 类型识别机制

优先级（`getFileType`）：MIME → 扩展名 → 点开头文件名 → `unsupported`。高级图片另有魔数探测（`detectImageFormat`：显式 MIME → 扩展名 → 文件头 12 字节：HEIC/HEIF、TIFF、AVIF、PSD、JP2）。

---

## 三、对标基线：kkFileView 支持清单

来源：<https://www.kkview.cn/zh-cn/docs/home.html>（原文逐项摘录）

- **Office**：`doc` `docx` `xls` `xlsx` `xlsm` `ppt` `pptx` `csv` `tsv` `dotm` `xlt` `xltm` `dot` `dotx` `xlam` `xla`
- **WPS Office**：`wps` `dps` `et` `ett` `wpt`
- **OpenOffice / LibreOffice**：`odt` `ods` `ots` `odp` `otp` `six` `ott` `fodt` `fods`
- **Visio**：`vsd` `vsdx`
- **Windows 图元**：`wmf` `emf`
- **Photoshop**：`psd`
- **文档**：`pdf` `ofd` `rtf`
- **思维导图**：`xmind`
- **工作流**：`bpmn`（另有 `drawio` 预览章节）
- **邮件**：`eml`
- **电子书**：`epub`
- **3D**：`obj` `3ds` `stl` `ply` `gltf` `glb` `off` `3dm` `fbx` `dae` `wrl` `3mf` `ifc` `brep` `step` `iges` `fcstd` `bim`
- **CAD**：`dwg` `dxf`
- **纯文本**：`txt` `xml`(渲染) `md`(渲染)、`java` `php` `py` `js` `css` 等；默认开启集含 `html` `htm` `asp` `jsp` `json` `properties` `gitignore` `log` `c` `cpp` `sql` `sh` `bat` `m` `bas` `prg` `cmd`
- **压缩包**：`zip` `rar` `jar` `tar` `gzip` `7z`
- **图片**：`jpg` `jpeg` `png` `gif` `bmp` `ico` `jfif` `webp` `tif` `tiff` `tga` `svg` `wmf` `emf`
- **音视频**：默认开启 `mp3` `wav` `mp4` `flv`；转码预览支持 `avi` `mov` `rm` `rmvb` `wmv` `webm` `ts` `mpeg` `mpg` `ogg` `3gp` `swf`
- **其他**：`dcm` 医疗影像、`drawio` 流程图

> 注：kkFileView 的 `ofd`、`rtf`、`dwg`、`visio`、`wmf/emf`、音视频转码等能力**依赖服务端第三方组件**（LibreOffice、ImageMagick、FFmpeg、Aspose/OpenOffice 等），不是浏览器内实现。

---

## 四、差异矩阵

### 4.1 双方共有

图片：`jpg/jpeg/png/gif/bmp/ico/webp/svg/tif/tiff`、`psd`
文档：`pdf`、`docx`、`xlsx`、`pptx`、`csv`、`tsv`
文本代码：`txt` `xml` `md` `json` `java` `php` `py` `js` `css` 及 `html`（doc-preview 侧为源码高亮，非渲染）
压缩包：`zip`
音视频：`mp3` `wav` `mp4`（`flv` 双方均受限）
3D：`obj` `stl` `gltf` `glb`
电子书：`epub`

### 4.2 doc-preview 独有（kkFileView 未列出）

`heic` `heif` `avif` `cr2` `nef` `arw` `dng` `raf` `orf` `jp2` `jpx` `j2k`、`msg`、`mobi` `azw` `azw3` `kf8`、`ttf` `otf` `woff` `woff2`、`srt` `vtt` `lrc` `elrc` `ass` `ssa` `ttml` `dfxp`、`jsonc`、`m4a` `aac` `flac`（音频覆盖比 kkFileView 更全）

### 4.3 kkFileView 独有 → 缺口候选

按大类汇总见 §五。

---

## 五、缺口清单与优先级

分级依据：**常见程度**（真实使用频率）× **纯前端可行性**（doc-preview 无服务端）。

### P0 · 建议优先（常用 + 纯前端可行，成本低到中）

| 格式 | 现有缺口 | 建议路径 | 成本 |
|---|---|---|---|
| `eml` | 邮件只支持 `msg` | `postal-mime` / `emailjs-mime-parser` 解析后复用现有 MsgRenderer 结构（头信息 + 正文 + 附件） | 低 |
| `xls`（含 `xlsm`） | `exceljs` 仅支持 OOXML | 引入 SheetJS `xlsx`：可解析 BIFF8 `.xls`，顺带覆盖 `xlsm`、`ods`，作为 `exceljs` 的旁路或替换 | 中 |
| `7z` `rar` `tar` `gzip` `jar` | 压缩包只支持 `zip` | `tar`/`gzip` 纯 JS 可解（`fflate`/`tar-stream`）；`7z`/`rar` 走 WASM（`libarchive.js`）；`jar` 直接按 zip 复用现有渲染器 | 中 |
| `bpmn` | 无 | `bpmn-js`（纯前端，零转换） | 中 |
| `xmind` | 无 | XMind 文件本质是 zip + JSON，复用 `@zip.js/zip.js` 解包后自绘或用现成 viewer | 中 |
| `tga` | 无 | three.js 自带 `TGALoader`，项目已依赖 `three` | 低 |

### P1 · 建议，但成本中高或目标用户面窄

| 格式 | 说明 |
|---|---|
| `ofd` | 国产版式文档，政务/发票高频。OFD 为 zip + XML，可复用 zip 解包自研渲染，或接 `ofd.js` |
| `rtf` | `rtf.js` 前端可渲染，中等成本 |
| `drawio` | 本质 XML(mxGraph)，可复用 XML 分支自研渲染或接 drawio viewer |
| `vsd` `vsdx` | `vsdx` 是 OPC 包，可解包；完整图形渲染需自研，成本较高 |
| `dcm` | `cornerstone.js` 生态；项目**已依赖** `@cornerstonejs/codec-openjpeg`，技术衔接自然，但场景窄 |
| 3D 扩展 | `ply` `fbx` `3ds` `dae` `wrl` `3mf` `off` 可由 three.js 现成 Loader 覆盖（成本低）；`step` `iges` `ifc` `brep` `bim` `fcstd` 属工程 CAD，前端极难，建议不做 |
| `html` 渲染预览 | kkFileView 支持 `html/htm/asp/jsp` 渲染；当前 doc-preview 只做源码高亮。可在 iframe + 沙箱下提供渲染模式（需处理脚本/XSS 风险） |

### P2 · 不建议（纯前端不可行或不常用）

| 格式 | 原因 |
|---|---|
| `doc` `ppt`（二进制） | 前端无可靠解析库，必须服务端转换；与当前纯前端架构冲突 |
| `wps` `dps` `et` `ett` `wpt` | WPS 私有/二进制格式，无前端解析方案 |
| `odt` `odp` `ott` `ots` `otp` `fodt` `fods` | ODF 复杂版面格式，除 `ods`（SheetJS 可覆盖）外前端基本不可行 |
| `dotm` `dot` `dotx` `xlt` `xltm` `xlam` `xla` | Office 模板/宏格式，使用频率低，且多数需旧版二进制解析 |
| `wmf` `emf` | Windows 矢量图元文件，浏览器无渲染器，需服务端转换 |
| `dwg` | 需 WASM/转换链路，前端成本极高 |
| `rm` `rmvb` `wmv` `mpeg` `mpg` `swf` | 浏览器 `<video>` 不支持，需服务端转码；纯前端不可行 |
| `jfif` | 实质即 JPEG，通常 MIME 为 `image/jpeg` 可命中；补扩展名别名即可，价值低 |
| `properties` | 通常 MIME 为 `text/plain`，已落入 `text` 分支，非真实缺口 |
| `six` | 疑似 kkFileView 内部类型标识，无通用语义，忽略 |

---

## 六、已支持但实际受限的格式（质量问题，非缺口）

| 格式 | 现象 | 证据 |
|---|---|---|
| `ppt` | `fileType.ts` 将 `ppt` 映射为 `pptx` 类型，但 `pptx-preview` 只解析 OOXML，二进制 `.ppt` 实际无法预览 | `fileType.ts`（`ext === 'ppt'` → `'pptx'`）、`Pptx/index.tsx`（`import { init } from 'pptx-preview'`） |
| `avi` `flv` | 被识别为 `video`，但 Video 渲染器显式短路为「浏览器不支持」提示 | `Video/index.tsx`：`BROWSER_UNSUPPORTED_EXTS = new Set(['avi','wmv','flv'])` |
| `mkv` | 未列入不支持集合，但浏览器对 MKV 支持不完整（Safari 不支持），可能静默失败 | `Video/index.tsx`、`fileType.ts` |
| `wmv` | 不在 `video` 扩展名列表内，会落到 `unsupported`（与 avi/flv 处理不一致） | `fileType.ts` video 分支 |

---

## 七、建议动作（供决策，不含实施）

1. **先修一致性缺陷**：`.ppt` 的虚假映射应改为明确提示或 `unsupported`；`wmv` 的视频识别与 `avi`/`flv` 对齐。
2. **P0 批次**：`eml` → `xls/xlsm`（SheetJS）→ `tar/gzip/7z/rar` → `bpmn` → `xmind` → `tga`。这一批全部可在无服务端前提下交付。
3. **文档口径**：在 `packages/docs/guide/supported-types.md` 增补「能力边界」章节，明确列出「因纯前端架构不支持」的格式及原因，避免用户按 kkFileView 的清单预期。
4. **如确需 kkFileView 级别的 Office/Visio/音视频转码能力**：需引入服务端转换，属于架构级变更，应单独立项评估（与当前「纯前端组件库」定位冲突）。

---

## 八、证据索引

| 结论 | 证据位置 |
|---|---|
| 渲染器清单 | `packages/react-file-preview/src/renderers/registry.tsx` |
| 扩展名 → FileType 映射 | `packages/file-preview-core/src/utils/fileType.ts` |
| 扩展名 → MIME 映射、高级图片判定 | `packages/file-preview-core/src/utils/mimeTypes.ts` |
| 高级图片按需解码与魔数探测 | `packages/file-preview-core/src/loaders/registry.ts` |
| 官方格式说明（含特性与兼容性） | `packages/docs/guide/supported-types.md` |
| 依赖库版本 | `packages/file-preview-core/package.json`、`packages/react-file-preview/package.json`、`packages/vue-file-preview/package.json` |
| 对标基线 | <https://www.kkview.cn/zh-cn/docs/home.html>（2026-10-10 抓取） |

---

## 九、偏差与未决事项

1. **联网路径偏差**：项目 `AGENTS.md` 规定联网必须通过 MCP `chrome_devtools`，但当前工作区未配置任何 MCP server（`servers: []`），该工具不可用。本次改用 Proma 内置受管浏览器读取 kkFileView 公开文档。如需严格合规，请先配置 `chrome_devtools` MCP 后重跑对标环节。
2. **对标深度**：本次仅抓取 kkFileView 文档「概述」页的格式清单；其各格式的具体渲染模式（图片模式 / PDF 模式）与服务端依赖未逐项展开。
3. **交付边界未确认**：本报告为调研结论，是否进入实现（P0 批次）需用户另行决策；届时按 `feature_dev` 意图重新走编排流程。
4. **kkFileView 清单可能滞后**：文档自述「支持的文件类型在进一步丰富中」，清单为文档时点快照。
