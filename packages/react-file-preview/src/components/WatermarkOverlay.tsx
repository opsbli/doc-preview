import { useEffect, useRef, useCallback } from 'react';
import { resolveWatermarkLayers, type ResolvedWatermarkLayer } from '@opsbli/file-preview-core';
import type { WatermarkConfig } from '@opsbli/file-preview-core';

interface WatermarkOverlayProps {
  config: WatermarkConfig;
  containerRef: React.RefObject<HTMLElement | null>;
  /** 当前主题（dark/light），用于默认水印颜色自适应 */
  theme: 'dark' | 'light';
}

// 高于内容区所有内部元素：xlsx editor-area z-100 / dropdown z-200 / tooltip z-50 / 大纲 z-20 / 工具栏 z-10
const DEFAULT_Z_INDEX = 800;

/**
 * 按 tile 绝对位置判断该点是否位于浅色内容区域。
 * 命中时该 tile 水印用深色，否则用主题色 —— 解决 ZIP 内"左侧深色文件树 + 右侧浅色内容（xlsx 白底 / docx 白纸）"的混合背景。
 *
 * 检测方式：
 * 1. x-data-spreadsheet 表格区域（库内 canvas 白底，DOM 读不到背景色）
 * 2. 按点检测实际背景亮度（elementFromPoint 命中 canvas 下方的内容元素，向上找非透明背景色）
 */
function isLightContentAt(container: HTMLElement | null, x: number, y: number): boolean {
  if (!container) return false;
  const crect = container.getBoundingClientRect();
  const ax = crect.left + x;
  const ay = crect.top + y;

  // 1) xlsx 表格区域（canvas 绘制白底，elementFromPoint 读不到）
  const table = container.querySelector('.x-spreadsheet-table');
  if (table) {
    const trect = table.getBoundingClientRect();
    if (ax >= trect.left && ax <= trect.right && ay >= trect.top && ay <= trect.bottom) {
      return true;
    }
  }

  // 2) 按点检测实际背景亮度（docx 白纸等）
  const el = document.elementFromPoint(ax, ay);
  if (!el || !container.contains(el)) return false;
  let cur: Element | null = el;
  while (cur && cur !== container) {
    const bg = getComputedStyle(cur).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      const m = bg.match(/rgba?\((\d+), (\d+), (\d+)/);
      if (m) {
        const brightness = (parseInt(m[1], 10) + parseInt(m[2], 10) + parseInt(m[3], 10)) / 3;
        return brightness > 150; // 浅色背景
      }
      break;
    }
    cur = cur.parentElement;
  }
  return false;
}

/**
 * 图片等比缩放（contain 适配）：
 * 以 imageSize 为约束盒，保持图片原始宽高比缩放，避免拉伸变形。
 * 图片未加载完成（naturalWidth 为 0）时回退为 imageSize 原值。
 */
function getScaledImageSize(layer: ResolvedWatermarkLayer, img: HTMLImageElement | null): [number, number] {
  const [w, h] = layer.imageSize;
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    return [img.naturalWidth * scale, img.naturalHeight * scale];
  }
  return [w, h];
}

/** 从字体字符串解析字号（px），解析失败时回退 14 */
function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 14;
}

/** 解析该 tile 的文字颜色：未显式配色时对浅色内容区域自适应为深色 */
function resolveTileColor(layer: ResolvedWatermarkLayer, container: HTMLElement | null, absX: number, absY: number): string {
  if (!layer.colorExplicit && isLightContentAt(container, absX, absY)) {
    return '#000000';
  }
  return layer.color;
}

/**
 * 在锚点 (x, y) 处绘制单个水印单元（图片 / 文字 / 图片+文字组合）。
 * 调用方已 translate+rotate 到该锚点，此处以 (x, y) 为组合中心布局。
 */
function drawTileContent(
  ctx: CanvasRenderingContext2D,
  layer: ResolvedWatermarkLayer,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  container: HTMLElement | null,
  absX: number,
  absY: number,
) {
  const text = layer.text ?? '';

  // 纯图片层
  if (layer.type === 'image' && img) {
    const [dw, dh] = getScaledImageSize(layer, img);
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    return;
  }

  // 纯文字层
  if (layer.type === 'text') {
    ctx.fillStyle = resolveTileColor(layer, container, absX, absY);
    ctx.fillText(text, x, y);
    return;
  }

  // 图片+文字组合层：图左文右（horizontal）或图上文下（vertical），并排不重叠
  const [dw, dh] = getScaledImageSize(layer, img);
  const textW = text ? ctx.measureText(text).width : 0;
  const textH = fontPx(layer.font);
  const gap = layer.gap;

  ctx.fillStyle = resolveTileColor(layer, container, absX, absY);

  if (layer.layout === 'vertical') {
    const totalH = dh + gap + textH;
    if (img) ctx.drawImage(img, x - dw / 2, y - totalH / 2, dw, dh);
    if (text) ctx.fillText(text, x, y - totalH / 2 + dh + gap + textH / 2);
  } else {
    // horizontal：图左文右
    const totalW = dw + gap + textW;
    if (img) ctx.drawImage(img, x - totalW / 2, y - dh / 2, dw, dh);
    if (text) ctx.fillText(text, x - totalW / 2 + dw + gap + textW / 2, y);
  }
}

/**
 * 单层水印：按 position 布局绘制，每个 tile 旋转 radians 并调用 drawTileContent。
 */
function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: ResolvedWatermarkLayer,
  img: HTMLImageElement | null,
  container: HTMLElement | null,
  w: number,
  h: number,
  radians: number,
  spacingX: number,
  spacingY: number,
) {
  const drawAt = (x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(radians);
    drawTileContent(ctx, layer, img, 0, 0, container, x, y);
    ctx.restore();
  };

  if (layer.position === 'center') {
    drawAt(w / 2, h / 2);
  } else if (layer.position === 'diagonal') {
    // 对角线平铺：沿对角线方向排列
    const step = Math.max(spacingX, spacingY) * 1.5;
    for (let row = -2; row < (h + step) / step; row++) {
      for (let col = -2; col < (w + step) / step; col++) {
        const offsetX = (row + col) * step / 2;
        const offsetY = (row - col) * step / 2;
        drawAt(offsetX + step / 2, offsetY + step / 2);
      }
    }
  } else {
    // tile 平铺
    for (let y = spacingY / 2; y < h + spacingY; y += spacingY) {
      for (let x = spacingX / 2; x < w + spacingX; x += spacingX) {
        drawAt(x, y);
      }
    }
  }
}

/**
 * 水印覆盖层组件
 * 使用 Canvas 渲染水印，pointer-events: none 保证不干扰交互
 * 支持多层叠加（layers）：文字/图片/图片+文字层任意混合，数组顺序即绘制顺序
 */
export function WatermarkOverlay({ config, containerRef, theme }: WatermarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 图片层缓存：layerIndex → HTMLImageElement（多图片层独立预加载）
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const drawWatermark = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 逐层绘制：后绘制的层叠放于上方（数组顺序即层序）
    resolveWatermarkLayers(config, theme).forEach((layer, layerIndex) => {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      const radians = (layer.rotation * Math.PI) / 180;
      const [spacingX, spacingY] = layer.spacing;

      if (layer.type === 'image' && layer.imageUrl) {
        const img = imgCacheRef.current.get(layerIndex);
        if (img?.complete && img.naturalWidth > 0) {
          drawLayer(ctx, layer, img, container, w, h, radians, spacingX, spacingY);
        }
        // 图片未加载完成（或加载失败）：该层保持空白
      } else if (layer.type === 'text' && layer.text) {
        ctx.font = layer.font;
        drawLayer(ctx, layer, null, container, w, h, radians, spacingX, spacingY);
      } else if (layer.type === 'both') {
        const img = layer.imageUrl ? imgCacheRef.current.get(layerIndex) : null;
        // 组合层：无图片 URL 时退化为纯文字；有图片 URL 但未加载完成时保持空白
        const imgReady = !layer.imageUrl || (img?.complete && img.naturalWidth > 0);
        if (imgReady) {
          ctx.font = layer.font;
          drawLayer(ctx, layer, img ?? null, container, w, h, radians, spacingX, spacingY);
        }
      }

      ctx.restore();
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [config, theme, containerRef]);

  // 监听容器尺寸变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      drawWatermark();
    });
    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [containerRef, drawWatermark]);

  // 监听容器子节点变化（如 xlsx 表格延迟挂载）后重绘水印，
  // 确保浅色内容检测（.x-spreadsheet-table）在内容渲染完成后生效
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => drawWatermark(), 200);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [containerRef, drawWatermark]);

  // 兜底轮询：MutationObserver 可能漏掉 React 整体重挂载场景
  // （如 ZIP 内切换文件时内层渲染器整体替换），此时浅色内容状态变化不会被捕获。
  // 每 500ms 检测浅色内容状态，变化时重绘水印。
  const lastLightStateRef = useRef<boolean>(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    lastLightStateRef.current = !!container.querySelector('.x-spreadsheet-table');

    const interval = setInterval(() => {
      const c = containerRef.current;
      if (!c) return;
      const nowLight = !!c.querySelector('.x-spreadsheet-table');
      if (nowLight !== lastLightStateRef.current) {
        lastLightStateRef.current = nowLight;
        drawWatermark();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [containerRef, drawWatermark]);

  // 图片层预加载：所有图片层独立加载，全部就绪后重绘
  useEffect(() => {
    const cache = imgCacheRef.current;
    cache.clear();

    let pending = 0;
    resolveWatermarkLayers(config, theme).forEach((layer, layerIndex) => {
      if (layer.type !== 'image' && layer.type !== 'both') return;
      if (!layer.imageUrl) return;

      pending++;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const redraw = () => {
        if (--pending === 0) drawWatermark();
      };
      img.onload = redraw;
      img.onerror = redraw; // 加载失败：该层跳过，其余层不受影响
      img.src = layer.imageUrl;
      cache.set(layerIndex, img);
    });

    return () => {
      cache.clear();
    };
  }, [config, theme, drawWatermark]);

  // config 变化时重绘（文字层与图片层统一触发）
  useEffect(() => {
    drawWatermark();
  }, [config, theme, drawWatermark]);

  return (
    <canvas
      ref={canvasRef}
      className="rfp-absolute rfp-inset-0 rfp-pointer-events-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: config.zIndex ?? DEFAULT_Z_INDEX,
        pointerEvents: 'none',
      }}
    />
  );
}
