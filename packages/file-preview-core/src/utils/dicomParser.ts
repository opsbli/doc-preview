/**
 * DICOM（.dcm）解析与灰度渲染工具
 *
 * 支持范围（明确边界，不做静默失败）：
 * - 传输语法：未压缩的 Implicit VR LE / Explicit VR LE
 * - 像素：MONOCHROME1 / MONOCHROME2 灰度（8/16 位），RGB（8 位，Planar Configuration = 0）
 * - 多帧：解析全部帧，渲染时按帧索引取用
 *
 * 不支持（抛出带传输语法的明确错误）：封装（压缩）传输语法 JPEG / JPEG-LS / JPEG2000 / RLE、
 * 大端 Explicit VR BE、Deflated Explicit VR LE、Planar Configuration = 1、YBR 颜色空间。
 */
import { parseDicom } from 'dicom-parser';

/** 未压缩且本模块支持的传输语法 */
const SUPPORTED_TRANSFER_SYNTAXES = new Set([
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
]);

const UNSUPPORTED_SYNTAX_LABELS: Record<string, string> = {
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
};

export interface DicomMeta {
  transferSyntaxUid: string;
  modality?: string;
  patientName?: string;
  studyDescription?: string;
  seriesDescription?: string;
}

export interface DicomImage {
  width: number;
  height: number;
  /** 帧数 */
  frames: number;
  /** 每像素样本数（1 = 灰度，3 = RGB） */
  samplesPerPixel: number;
  /** 重标定后的像素值（多帧按顺序拼接；RGB 为交错样本） */
  values: Float32Array;
  /** 默认窗中心 / 窗宽 */
  windowCenter: number;
  windowWidth: number;
  /** 值域 */
  minValue: number;
  maxValue: number;
  /** MONOCHROME1：像素值越大越黑 */
  inverted: boolean;
  meta: DicomMeta;
}

function requireNumber(value: number | undefined, name: string): number {
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`DICOM 缺少必要字段：${name}`);
  }
  return value;
}

/**
 * 解析 .dcm 为可渲染的图像模型
 *
 * @throws 传输语法不支持、缺少必要字段或像素数据异常时抛出（错误信息包含具体原因）
 */
export function parseDicomImage(buffer: ArrayBuffer): DicomImage {
  let dataSet: ReturnType<typeof parseDicom>;
  try {
    dataSet = parseDicom(new Uint8Array(buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`DICOM 结构解析失败: ${message}`);
  }

  const transferSyntaxUid = dataSet.string('x00020010') ?? '1.2.840.10008.1.2.1';
  if (!SUPPORTED_TRANSFER_SYNTAXES.has(transferSyntaxUid)) {
    const label = UNSUPPORTED_SYNTAX_LABELS[transferSyntaxUid] ?? '未知压缩语法';
    throw new Error(
      `暂不支持该 DICOM 传输语法：${label}（${transferSyntaxUid}）。当前仅支持未压缩的 Implicit/Explicit VR Little Endian。`,
    );
  }

  const width = requireNumber(dataSet.uint16('x00280010'), 'Columns(0028,0010)');
  const height = requireNumber(dataSet.uint16('x00280011'), 'Rows(0028,0011)');
  const bitsAllocated = dataSet.uint16('x00280100') ?? 16;
  const samplesPerPixel = dataSet.uint16('x00280002') ?? 1;
  const photometric = (dataSet.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase();
  const planarConfiguration = dataSet.uint16('x00280006') ?? 0;
  const numberOfFrames = dataSet.intString('x00280008') ?? 1;

  if (bitsAllocated !== 8 && bitsAllocated !== 16) {
    throw new Error(`暂不支持 ${bitsAllocated} 位像素（仅支持 8 / 16 位）`);
  }
  if (samplesPerPixel !== 1 && samplesPerPixel !== 3) {
    throw new Error(`暂不支持 ${samplesPerPixel} 通道像素（仅支持灰度与 RGB）`);
  }
  if (samplesPerPixel === 3 && planarConfiguration !== 0) {
    throw new Error('暂不支持 Planar Configuration = 1 的彩色 DICOM');
  }
  if (samplesPerPixel === 3 && photometric !== 'RGB') {
    throw new Error(`暂不支持彩色 DICOM 的颜色空间：${photometric}（仅支持 RGB）`);
  }
  if (samplesPerPixel === 1 && photometric !== 'MONOCHROME1' && photometric !== 'MONOCHROME2') {
    throw new Error(`暂不支持灰度 DICOM 的颜色空间：${photometric}`);
  }

  const pixelElement = dataSet.elements.x7fe00010;
  if (!pixelElement || !pixelElement.length) {
    throw new Error('DICOM 未包含像素数据');
  }

  const pixelBytes = dataSet.byteArray.subarray(
    pixelElement.dataOffset,
    pixelElement.dataOffset + pixelElement.length,
  );

  const sampleCount = width * height * samplesPerPixel * numberOfFrames;
  const rawValues = new Float32Array(sampleCount);
  const view = new DataView(pixelBytes.buffer, pixelBytes.byteOffset, pixelBytes.byteLength);

  if (bitsAllocated === 16) {
    if (view.byteLength < sampleCount * 2) {
      throw new Error('DICOM 像素数据长度不足（与 Rows/Columns/帧数不一致）');
    }
    for (let i = 0; i < sampleCount; i++) {
      rawValues[i] = view.getUint16(i * 2, true);
    }
  } else {
    if (view.byteLength < sampleCount) {
      throw new Error('DICOM 像素数据长度不足（与 Rows/Columns/帧数不一致）');
    }
    for (let i = 0; i < sampleCount; i++) {
      rawValues[i] = view.getUint8(i);
    }
  }

  // 重标定（Rescale Slope / Intercept）
  const slope = dataSet.floatString('x00281053') ?? 1;
  const intercept = dataSet.floatString('x00281052') ?? 0;
  if (slope !== 1 || intercept !== 0) {
    for (let i = 0; i < rawValues.length; i++) {
      rawValues[i] = rawValues[i] * slope + intercept;
    }
  }

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < rawValues.length; i++) {
    const value = rawValues[i];
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0;
    maxValue = bitsAllocated === 16 ? 65535 : 255;
  }

  const tagWindowCenter = dataSet.floatString('x00281050');
  const tagWindowWidth = dataSet.floatString('x00281051');
  const span = maxValue - minValue;
  const windowWidth = tagWindowWidth && tagWindowWidth > 0 ? tagWindowWidth : Math.max(span, 1);
  const windowCenter = tagWindowCenter ?? (minValue + maxValue) / 2;

  return {
    width,
    height,
    frames: numberOfFrames,
    samplesPerPixel,
    values: rawValues,
    windowCenter,
    windowWidth,
    minValue,
    maxValue,
    inverted: photometric === 'MONOCHROME1',
    meta: {
      transferSyntaxUid,
      modality: dataSet.string('x00080060'),
      patientName: dataSet.string('x00100010'),
      studyDescription: dataSet.string('x00081030'),
      seriesDescription: dataSet.string('x0008103e'),
    },
  };
}

/**
 * 按窗中心/窗宽渲染指定帧为 RGBA
 *
 * @param out 可选复用的输出缓冲（长度需为 width*height*4）
 */
export function renderDicomFrame(
  image: DicomImage,
  frameIndex: number,
  windowCenter: number,
  windowWidth: number,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const { width, height, samplesPerPixel, frames } = image;
  const safeFrame = Math.min(Math.max(frameIndex, 0), Math.max(frames - 1, 0));
  const pixelCount = width * height;
  const rgba = out && out.length === pixelCount * 4 ? out : new Uint8ClampedArray(pixelCount * 4);
  const frameOffset = safeFrame * pixelCount * samplesPerPixel;

  if (samplesPerPixel === 3) {
    // RGB 8 位：窗宽窗位不做处理，直接映射
    for (let i = 0; i < pixelCount; i++) {
      const source = frameOffset + i * 3;
      rgba[i * 4] = image.values[source];
      rgba[i * 4 + 1] = image.values[source + 1];
      rgba[i * 4 + 2] = image.values[source + 2];
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  const width2 = windowWidth > 0 ? windowWidth : 1;
  const lower = windowCenter - width2 / 2;
  const scale = 255 / width2;
  const inverted = image.inverted;

  for (let i = 0; i < pixelCount; i++) {
    const value = image.values[frameOffset + i];
    let gray = (value - lower) * scale;
    if (gray < 0) gray = 0;
    else if (gray > 255) gray = 255;
    const level = inverted ? 255 - gray : gray;
    const target = i * 4;
    rgba[target] = level;
    rgba[target + 1] = level;
    rgba[target + 2] = level;
    rgba[target + 3] = 255;
  }

  return rgba;
}
