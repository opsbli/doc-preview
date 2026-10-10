/**
 * 旧版二进制 Excel（.xls，BIFF8）数据转换
 *
 * exceljs 只能解析 OOXML（.xlsx/.xlsm），无法读取 Office 97-2003 的 .xls。
 * 这里用 SheetJS（xlsx）做兼容解析，并转换为与 `convertWorkbookToSpreadsheetData`
 * 一致的 x-data-spreadsheet 数据模型，使渲染层无需区分数据来源。
 *
 * 说明：SheetJS 社区版不提供完整样式，故本路径只还原单元格文本、行列结构与合并区域，
 * 不还原字体/底色/边框等样式（样式仍由 OOXML 路径的 exceljs 负责）。
 */
import type { XCellData, XRowData, XSheetData } from './excelDataConverter';

/** SheetJS 单元格的最小结构（避免直接依赖其类型命名） */
interface SheetJsCell {
  v?: unknown;
  w?: string;
  t?: string;
}

interface SheetJsRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

interface SheetJsWorksheet {
  '!ref'?: string;
  '!merges'?: SheetJsRange[];
  [address: string]: unknown;
}

interface SheetJsWorkbook {
  SheetNames: string[];
  Sheets: Record<string, SheetJsWorksheet | undefined>;
}

interface SheetJsModule {
  read(data: ArrayBuffer, options?: Record<string, unknown>): SheetJsWorkbook;
  utils: {
    decode_range(ref: string): SheetJsRange;
    encode_cell(address: { r: number; c: number }): string;
  };
}

/**
 * 将 .xls 文件字节转换为 x-data-spreadsheet 数据格式
 *
 * @throws 当文件结构无法解析时抛出
 */
export async function convertXlsToSpreadsheetData(buffer: ArrayBuffer): Promise<XSheetData[]> {
  let XLSX: SheetJsModule;
  try {
    XLSX = (await import('xlsx')) as unknown as SheetJsModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`XLS 解析器加载失败: ${message}`);
  }

  let workbook: SheetJsWorkbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    throw new Error(`XLS 解析失败: ${message}`);
  }

  const result: XSheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet || !worksheet['!ref']) {
      result.push({ name: sheetName, styles: [], rows: {}, cols: {} });
      continue;
    }

    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const colCount = range.e.c - range.s.c + 1;

    // 合并区域：只把跨度记在左上角单元格上（与 OOXML 路径行为一致）
    const mergeSpans = new Map<string, [number, number]>();
    for (const merge of worksheet['!merges'] ?? []) {
      const top = merge.s.r - range.s.r;
      const left = merge.s.c - range.s.c;
      mergeSpans.set(`${top},${left}`, [merge.e.r - merge.s.r, merge.e.c - merge.s.c]);
    }

    const rows: Record<string, XRowData> = {};
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: Record<string, XCellData> = {};
      for (let c = range.s.c; c <= range.e.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[address] as SheetJsCell | undefined;
        if (!cell) continue;

        const text = typeof cell.w === 'string' ? cell.w : cell.v === undefined || cell.v === null ? '' : String(cell.v);
        if (text === '') continue;

        const rowIndex = r - range.s.r;
        const colIndex = c - range.s.c;
        const cellData: XCellData = { text };
        const span = mergeSpans.get(`${rowIndex},${colIndex}`);
        if (span) cellData.merge = span;
        cells[String(colIndex)] = cellData;
      }

      if (Object.keys(cells).length > 0) {
        rows[String(r - range.s.r)] = { cells };
      }
    }

    result.push({
      name: sheetName,
      styles: [],
      rows,
      cols: { len: Math.max(colCount, 26) },
    });
  }

  if (result.length === 0) {
    throw new Error('XLS 文件中没有可用的工作表');
  }

  return result;
}
