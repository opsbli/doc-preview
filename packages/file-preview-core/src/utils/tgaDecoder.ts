/**
 * TGA（Truevision TGA / Targa）纯解码器
 *
 * 零依赖、无 DOM 依赖，可被 loaders/tgaLoader.ts 复用，也可被测试直接调用。
 *
 * 支持范围：
 * - imageType 1 / 2 / 3：未压缩的 色表 / 真彩 / 灰度
 * - imageType 9 / 10 / 11：RLE 压缩的 色表 / 真彩 / 灰度
 * - 像素深度 8 / 15 / 16 / 24 / 32
 * - 色表条目 15 / 16 / 24 / 32 位
 * - 图像原点在左上或左下（imageDescriptor bit 5）、左右镜像（bit 4）
 *
 * 不支持：交错（interleaved）多通道 TGA（imageDescriptor bit 6-7 非 0）。
 */

/** 解码结果：RGBA 像素（行优先，左上原点） */
export interface DecodedTgaImage {
  width: number;
  height: number;
  /** 长度 = width * height * 4 */
  rgba: Uint8ClampedArray;
}

const HEADER_SIZE = 18;

/** 5 位分量扩展到 8 位 */
function expand5(value: number): number {
  return (value << 3) | (value >> 2);
}

/** 读取一个色表条目为 RGBA */
function readColorMapEntry(
  colorMap: Uint8Array,
  entry: number,
  entrySize: number,
): [number, number, number, number] {
  if (entrySize === 15 || entrySize === 16) {
    const value = colorMap[entry] | (colorMap[entry + 1] << 8);
    return [expand5((value >> 10) & 0x1f), expand5((value >> 5) & 0x1f), expand5(value & 0x1f), 255];
  }
  if (entrySize === 24) {
    return [colorMap[entry + 2], colorMap[entry + 1], colorMap[entry], 255];
  }
  // 32 位色表为 BGRA
  return [colorMap[entry + 2], colorMap[entry + 1], colorMap[entry], colorMap[entry + 3]];
}

/**
 * 解析 TGA 字节流为 RGBA 像素
 *
 * @throws 当文件头不完整、尺寸无效、像素深度不支持或数据长度不足时抛出
 */
export function decodeTgaImage(buffer: ArrayBuffer): DecodedTgaImage {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_SIZE) {
    throw new Error('TGA 文件头不完整');
  }

  const view = new DataView(buffer);
  const idLength = view.getUint8(0);
  const colorMapType = view.getUint8(1);
  const imageType = view.getUint8(2);
  const colorMapFirstIndex = view.getUint16(3, true);
  const colorMapLength = view.getUint16(5, true);
  const colorMapEntrySize = view.getUint8(7);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const pixelDepth = view.getUint8(16);
  const imageDescriptor = view.getUint8(17);

  if (width <= 0 || height <= 0) {
    throw new Error('TGA 图像尺寸无效');
  }

  const interleaving = (imageDescriptor >> 6) & 0x03;
  if (interleaving !== 0) {
    throw new Error('不支持交错（interleaved）TGA 图像');
  }

  const rleEncoded = imageType === 9 || imageType === 10 || imageType === 11;
  const baseType = rleEncoded ? imageType - 8 : imageType;
  if (baseType !== 1 && baseType !== 2 && baseType !== 3) {
    throw new Error(`不支持的 TGA imageType: ${imageType}`);
  }

  const colorMapped = baseType === 1;
  const trueColor = baseType === 2;
  const pixelBytes = Math.ceil(pixelDepth / 8);
  if (pixelBytes < 1 || pixelBytes > 4) {
    throw new Error(`不支持的 TGA 像素深度: ${pixelDepth}`);
  }

  let offset = HEADER_SIZE + idLength;

  let colorMap: Uint8Array | null = null;
  if (colorMapType === 1) {
    if (colorMapEntrySize === 0) {
      throw new Error('TGA 色表条目大小缺失');
    }
    const entryBytes = Math.ceil(colorMapEntrySize / 8);
    const mapBytes = colorMapLength * entryBytes;
    if (offset + mapBytes > bytes.length) {
      throw new Error('TGA 色表数据不完整');
    }
    colorMap = bytes.subarray(offset, offset + mapBytes);
    offset += mapBytes;
  }

  const totalPixels = width * height;
  const pixels = new Uint8Array(totalPixels * pixelBytes);

  if (rleEncoded) {
    let written = 0;
    while (written < totalPixels) {
      if (offset >= bytes.length) {
        throw new Error('TGA 像素数据不完整');
      }
      const packetHeader = bytes[offset++];
      const count = (packetHeader & 0x7f) + 1;
      if (packetHeader & 0x80) {
        // RLE 包：同一像素重复 count 次
        if (offset + pixelBytes > bytes.length) {
          throw new Error('TGA RLE 数据不完整');
        }
        const source = bytes.subarray(offset, offset + pixelBytes);
        offset += pixelBytes;
        const repeat = Math.min(count, totalPixels - written);
        for (let i = 0; i < repeat; i++) {
          pixels.set(source, written * pixelBytes);
          written++;
        }
      } else {
        // 原始包：连续 count 个像素
        const take = Math.min(count, totalPixels - written);
        if (offset + take * pixelBytes > bytes.length) {
          throw new Error('TGA 原始像素数据不完整');
        }
        pixels.set(bytes.subarray(offset, offset + take * pixelBytes), written * pixelBytes);
        offset += take * pixelBytes;
        written += take;
      }
    }
  } else {
    const needed = totalPixels * pixelBytes;
    if (offset + needed > bytes.length) {
      throw new Error('TGA 像素数据长度不足');
    }
    pixels.set(bytes.subarray(offset, offset + needed));
  }

  const topOrigin = (imageDescriptor & 0x20) !== 0;
  const rightOrigin = (imageDescriptor & 0x10) !== 0;
  const colorMapEntryBytes = Math.ceil(colorMapEntrySize / 8);
  const rgba = new Uint8ClampedArray(totalPixels * 4);

  for (let y = 0; y < height; y++) {
    const destRow = topOrigin ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const destCol = rightOrigin ? width - 1 - x : x;
      const sourceOffset = (y * width + x) * pixelBytes;
      const target = (destRow * width + destCol) * 4;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (colorMapped) {
        let index = 0;
        for (let i = 0; i < pixelBytes; i++) {
          index |= pixels[sourceOffset + i] << (8 * i);
        }
        index -= colorMapFirstIndex;
        if (!colorMap || index < 0 || index >= colorMapLength) {
          a = 0;
        } else {
          [r, g, b, a] = readColorMapEntry(colorMap, index * colorMapEntryBytes, colorMapEntrySize);
        }
      } else if (trueColor) {
        if (pixelDepth === 15 || pixelDepth === 16) {
          const value = pixels[sourceOffset] | (pixels[sourceOffset + 1] << 8);
          r = expand5((value >> 10) & 0x1f);
          g = expand5((value >> 5) & 0x1f);
          b = expand5(value & 0x1f);
        } else if (pixelDepth === 24) {
          b = pixels[sourceOffset];
          g = pixels[sourceOffset + 1];
          r = pixels[sourceOffset + 2];
        } else {
          b = pixels[sourceOffset];
          g = pixels[sourceOffset + 1];
          r = pixels[sourceOffset + 2];
          a = pixels[sourceOffset + 3];
        }
      } else if (pixelDepth === 8) {
        r = g = b = pixels[sourceOffset];
      } else {
        // 16 位灰度：亮度 + alpha
        r = g = b = pixels[sourceOffset];
        a = pixels[sourceOffset + 1];
      }

      rgba[target] = r;
      rgba[target + 1] = g;
      rgba[target + 2] = b;
      rgba[target + 3] = a;
    }
  }

  return { width, height, rgba };
}
