import type { WatermarkConfig, WatermarkLayer, WatermarkLayout, WatermarkMode, WatermarkPosition } from '../types';

/**
 * 归一化后的水印层：所有可选配置已填充默认值
 */
export interface ResolvedWatermarkLayer {
  type: WatermarkMode;
  text?: string;
  imageUrl?: string;
  /** 图片+文字组合布局：图左文右（horizontal）或图上文下（vertical） */
  layout: WatermarkLayout;
  /** 图片与文字的间距（px） */
  gap: number;
  font: string;
  color: string;
  /** 用户是否显式配置了 color（未配置时文字层需做浅色内容区域自适应） */
  colorExplicit: boolean;
  imageSize: [number, number];
  opacity: number;
  rotation: number;
  spacing: [number, number];
  position: WatermarkPosition;
}

const DEFAULT_FONT = '14px sans-serif';
const DEFAULT_OPACITY = 0.35;
const DEFAULT_ROTATION = -30;
const DEFAULT_SPACING: [number, number] = [200, 150];
const DEFAULT_IMAGE_SIZE: [number, number] = [80, 80];
const DEFAULT_LAYOUT: WatermarkLayout = 'horizontal';
const DEFAULT_GAP = 8;

/**
 * 将 WatermarkConfig 归一化为水印层列表（双框架共享）：
 * - 未提供 layers 时，由 mode + 顶层字段合成单层（等价于旧写法）
 * - 提供 layers 时逐层归一化，忽略顶层单层字段
 * - 无效层（type='text' 无 text / type='image' 无 imageUrl / type='both' 无 text 且无 imageUrl）被过滤
 * - color 默认随主题自适应（dark 白 / light 黑）
 */
export function resolveWatermarkLayers(
  config: WatermarkConfig,
  theme: 'dark' | 'light',
): ResolvedWatermarkLayer[] {
  const defaultColor = theme === 'dark' ? '#ffffff' : '#000000';

  const rawLayers: WatermarkLayer[] = config.layers?.length
    ? config.layers
    : [{
        type: config.mode,
        text: config.text,
        imageUrl: config.imageUrl,
        layout: config.layout,
        gap: config.gap,
        font: config.font,
        color: config.color,
        imageSize: config.imageSize,
        opacity: config.opacity,
        rotation: config.rotation,
        spacing: config.spacing,
        position: config.position,
      }];

  return rawLayers
    .filter((l) => {
      if (l.type === 'both') return !!l.text || !!l.imageUrl;
      return l.type === 'text' ? !!l.text : !!l.imageUrl;
    })
    .map((l) => ({
      type: l.type,
      text: l.text,
      imageUrl: l.imageUrl,
      layout: l.layout ?? DEFAULT_LAYOUT,
      gap: l.gap ?? DEFAULT_GAP,
      font: l.font ?? DEFAULT_FONT,
      color: l.color ?? defaultColor,
      colorExplicit: !!l.color,
      imageSize: l.imageSize ?? DEFAULT_IMAGE_SIZE,
      opacity: l.opacity ?? DEFAULT_OPACITY,
      rotation: l.rotation ?? DEFAULT_ROTATION,
      spacing: l.spacing ?? DEFAULT_SPACING,
      position: l.position ?? ('tile' as WatermarkPosition),
    }));
}
