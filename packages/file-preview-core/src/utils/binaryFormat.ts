/**
 * 二进制容器格式探测工具（零依赖、无 DOM 依赖）
 */

/** OLE 复合文档魔数：D0 CF 11 E0 A1 B1 1A E1 */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

/**
 * 检测是否为 OLE 复合文档（旧版 Office 97-2003 二进制容器）。
 *
 * `.doc` / `.xls` / `.ppt` 均为该容器格式，前端无法用 OOXML 解析器（mammoth /
 * exceljs / pptx-preview）读取，需要据此给出明确提示而非通用解析失败。
 */
export function isOleCompoundDocument(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < OLE_MAGIC.length) return false;
  const header = new Uint8Array(buffer, 0, OLE_MAGIC.length);
  return OLE_MAGIC.every((byte, index) => header[index] === byte);
}
