import type { ImageDecoder, DecodeOptions, ImageMetadata } from './types';
import { decodeTgaImage } from '../utils/tgaDecoder';

/**
 * TGA（Truevision TGA / Targa）浏览器图片解码器
 *
 * 纯解码逻辑在 `utils/tgaDecoder.ts`（零依赖、可测试），
 * 这里只负责把 RGBA 像素经 Canvas 转成浏览器可直接展示的 PNG Blob。
 *
 * 不引入 three.js 的 TGALoader，以避免把 three 带进 core 依赖。
 */
class TgaLoader implements ImageDecoder {
  /**
   * 浏览器不原生支持 TGA，始终需要解码
   */
  async needsDecode(mimeType: string): Promise<boolean> {
    return mimeType === 'image/x-tga' || mimeType === 'image/tga';
  }

  /**
   * 解码 TGA 为 PNG Blob
   */
  async decode(file: Blob | ArrayBuffer, options?: DecodeOptions): Promise<Blob> {
    try {
      const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
      const { width, height, rgba } = decodeTgaImage(arrayBuffer);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法创建 Canvas 2D 上下文');
      }

      const imageData = ctx.createImageData(width, height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('TGA Canvas 转换为 PNG 失败'));
            }
          },
          options?.outputFormat || 'image/png',
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new Error(`TGA 解码失败: ${message}`);
    }
  }

  /**
   * 获取 TGA 元数据（尺寸与格式）
   */
  async getMetadata(file: Blob | ArrayBuffer): Promise<ImageMetadata> {
    try {
      const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file;
      const view = new DataView(arrayBuffer);
      if (view.byteLength < 18) {
        return { format: 'tga', pageCount: 1 };
      }
      return {
        format: 'tga',
        pageCount: 1,
        width: view.getUint16(12, true),
        height: view.getUint16(14, true),
      };
    } catch {
      return { format: 'tga', pageCount: 1 };
    }
  }
}

export default new TgaLoader();
