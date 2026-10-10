# P1 缺口批次评估（doc-preview）

- 评估时间：2026-10-10 11:31 (GMT+8)
- 上游：`.pax/docs/doc_consult_20261010_104300_5953167b/format-support-gap-analysis.md`（P1 清单）
- 编排快照：`.pax/plan/feature_dev_20261010_111600_5953167b/pax-snapshot.yaml`
- 前置已完成：7z/rar 接入（提交 `fbf35ad`）

> 本文是「评估 + 待确认子集」，未获确认前不实现。下文「证据」列区分**已验证**与**待验证**。

---

## 一、逐项评估

### P1-1 · 3D 扩展（ply / fbx / dae / wrl / 3mf / amf）

- **证据（已验证，本地）**：项目已依赖 `three@0.170.0`，其 `examples/jsm/loaders/` 现成包含
  `PLYLoader`、`FBXLoader`、`ColladaLoader`（dae）、`VRMLLoader`（wrl）、`3MFLoader`、`AMFLoader`；
  现有 `Cad` 渲染器已用 three.js + DXFLoader/STLLoader/OBJLoader/GLTFLoader 的同一套模式。
- **缺口（已验证）**：`3ds` 在本版本 three 中**没有** loader（早期 `TDSLoader` 已不在 0.170 的发布内容中）；
  `off` 同样缺失。`step` / `iges` / `ifc` / `brep` / `bim` / `fcstd` 属工程 CAD，three.js 无覆盖，前端不可行。
- **成本**：低（零新增依赖，复用 Cad 渲染器的加载/材质/工具栏逻辑，按扩展名分派 loader）。
- **风险**：各 loader 对损坏文件的容错不同，需逐个给明确错误提示。
- **建议**：**做**（`ply` / `fbx` / `dae` / `wrl` / `3mf` / `amf`）。

### P1-2 · RTF

- **证据（已验证）**：`rtf.js@3.0.9`，许可 **MIT**，仅依赖 `codepage`（极小）。存在 types 入口。
- **成本**：中。需要把 rtf.js 的 DOM 渲染结果嵌入现有渲染器沙箱，并处理字体/表格边缘情况。
- **风险**：rtf.js 维护活跃度一般；复杂 RTF（嵌套表格、域代码）渲染不完整。
- **建议**：**可做**（需先做一次渲染效果验证）。

### P1-3 · drawio

- **证据（已验证）**：`@maxgraph/core@0.25.0`，许可 **Apache-2.0**，**零依赖**，含 ESM + types；
  它是 mxGraph 的官方继任者，可直接渲染 mxGraphModel XML（.drawio 未压缩时即该格式）。
- **缺口（待验证）**：`.drawio` 常被压缩（deflate + base64），需先解压再交给 maxgraph；
  压缩标记与解压流程需实测确认。
- **成本**：中。
- **建议**：**可做**（先验证压缩格式解压路径）。

### P1-4 · DICOM（dcm）

- **证据（已验证）**：`dicom-parser@1.8.21`，许可 **MIT**，无依赖，可解析元数据与原始像素；
  项目已依赖 `@cornerstonejs/codec-openjpeg`（现已用于 JPEG 2000 图片），可复用于
  DICOM 中 JPEG 2000 封装的传输语法。
- **缺口（已验证）**：完整 DICOM 查看需要窗宽窗位、多帧、方向/间距、以及多种封装传输语法
  （JPEG-LS / JPEG 有损 / RLE 等）。用 dicom-parser 只能覆盖未压缩与 JPEG/JPEG2000 子集。
- **成本**：中高（需自研灰度渲染与窗宽窗位交互）。
- **建议**：**可做但成本最高**，建议放在本批次最后或单独立项。

### P1-5 · OFD

- **证据（已验证）**：`ofd.js@1.5.0`，许可 Apache-2.0，但依赖 `axios`、`print-js`、
  `jsbarcode`、`fake-progress`、`parser_helper_x.js`。
- **冲突**：`axios`（自带网络层）与 `print-js`（自带打印/样式注入）与本库「纯渲染、零额外副作用」的
  风格冲突；直接整包引入会把无关能力与体积带进产物。
- **替代路径（待验证）**：OFD 本体是 ZIP + XML，可复用已依赖的 `@zip.js/zip.js` 解包后自研渲染
  （版式对象含文字/图片/路径），但工作量明显大于其它项。
- **成本**：高。
- **建议**：**暂缓**（若要做得先确认接受 axios/print-js 这类依赖，或承担自研成本）。

### P1-6 · Visio（vsd / vsdx）

- **证据（已验证）**：无现成的前端渲染库；`vsdx` 是 OPC 包（zip+XML），但图形语义复杂。
- **现实结论**：真正渲染流程图前端不可行；最多能列出包结构与内嵌图片（价值低，且容易被误解为"支持 vsdx"）。
- **建议**：**不做**（在文档能力边界中说明原因）。

### P1-7 · HTML 渲染模式

- **证据（已验证）**：现有 `fileType` 把 `html` 归入 `text`（源码高亮）；渲染模式需新增。
- **成本**：低（iframe + `sandbox` 属性 + 复用 `sanitizeEmailHtml` 同类的清洗/白名单策略）。
- **风险**：安全敏感。必须默认禁用脚本（`sandbox` 不带 `allow-scripts`），并明确与实际站点的
  隔离边界；需要单独的开关与文案，不能默认静默渲染。
- **建议**：**可做**（需先确定沙箱策略与是否默认关闭）。

---

## 二、候选依赖汇总（逐项授权用）

| 项 | 依赖 | 版本 | 许可 | 自包含 | 备注 |
|---|---|---|---|---|---|
| P1-1 3D 扩展 | 无（复用 three） | — | — | 是 | 零新增依赖 |
| P1-2 RTF | `rtf.js` | 3.0.9 | MIT | 是 | 仅 `codepage` 传递依赖 |
| P1-3 drawio | `@maxgraph/core` | 0.25.0 | Apache-2.0 | 是 | 零依赖 |
| P1-4 DCM | `dicom-parser` | 1.8.21 | MIT | 是 | 无依赖 |
| P1-5 OFD | `ofd.js` | 1.5.0 | Apache-2.0 | 是（但含 axios/print-js） | 建议暂缓 |
| P1-6 Visio | — | — | — | — | 建议不做 |
| P1-7 HTML | 无（复用现有清洗） | — | — | 是 | 需确定沙箱策略 |

许可一致性：以上均为 MIT / Apache-2.0，与本库 MIT 相容；不像 7z-wasm 那样引入 LGPL/unRAR 义务。

---

## 三、建议批次划分

- **批次 A（低成本、零依赖、收益直接）**：P1-1 3D 扩展（ply/fbx/dae/wrl/3mf/amf）
- **批次 B（中等成本、许可友好）**：P1-2 RTF、P1-3 drawio
- **批次 C（成本较高或需设计决策）**：P1-4 DCM、P1-7 HTML 渲染模式
- **暂缓/不做**：P1-5 OFD（依赖冲突）、P1-6 Visio（不可行）

每项在实现前都要像 7z/rar 那样先做一次**技术验证**（真实样例 + 真实依赖），不做假设性实现。
