import { encodeRgbPng } from "../util/png.js";
import { decodeRaster, readImageSize, sniffImageMime, type Raster } from "./raster.js";

/** 宽高比 3:4。允许模型四舍五入带来的轻微偏差。 */
const PORTRAIT_RATIO = 3 / 4;
const RATIO_TOLERANCE = 0.02;

export function isPortraitRatio(width: number, height: number): boolean {
  if (!width || !height) return false;
  return Math.abs(width / height - PORTRAIT_RATIO) <= RATIO_TOLERANCE;
}

/**
 * 已经接近 3:4 的图原样保留。
 * 否则居中裁成 3:4，不留边。裁不了时保留原图，避免出图整段失败。
 */
export function fitPortrait(bytes: Uint8Array): { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" } {
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error("文生图结果不是 PNG 或 JPEG，无法保存。");
  const size = readImageSize(bytes);
  if (size && isPortraitRatio(size.width, size.height)) return { bytes, mimeType: mime };
  const raster = decodeRaster(bytes);
  if (!raster) return { bytes, mimeType: mime };
  const cropped = centerCropPortrait(raster);
  if (isPortraitRatio(cropped.width, cropped.height) === false) return { bytes, mimeType: mime };
  const png = encodeRgbPng(cropped.width, cropped.height, cropped.rgb);
  return { bytes: new Uint8Array(png), mimeType: "image/png" };
}

function centerCropPortrait(raster: Raster): { width: number; height: number; rgb: Uint8Array } {
  let cropW = raster.width;
  let cropH = raster.height;
  if (raster.width / raster.height > PORTRAIT_RATIO) {
    cropW = Math.max(1, Math.min(raster.width, Math.round(raster.height * PORTRAIT_RATIO)));
  } else {
    cropH = Math.max(1, Math.min(raster.height, Math.round(raster.width / PORTRAIT_RATIO)));
  }
  const x0 = Math.floor((raster.width - cropW) / 2);
  const y0 = Math.floor((raster.height - cropH) / 2);
  const rgb = new Uint8Array(cropW * cropH * 3);
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const src = ((y0 + y) * raster.width + (x0 + x)) * raster.channels;
      const dst = (y * cropW + x) * 3;
      rgb[dst] = raster.data[src] ?? 0;
      rgb[dst + 1] = raster.data[src + 1] ?? 0;
      rgb[dst + 2] = raster.data[src + 2] ?? 0;
    }
  }
  return { width: cropW, height: cropH, rgb };
}
