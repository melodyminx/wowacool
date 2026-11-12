import { inflateSync } from "node:zlib";
import { decode as decodeJpegBytes } from "jpeg-js";

// jpeg-js is CommonJS. A static import lets Wrangler inline it.
// createRequire(import.meta.url) crashes Worker startup: the bundled script has no import.meta.url.

export interface Raster {
  width: number;
  height: number;
  /** 3 = RGB，4 = RGBA */
  channels: 3 | 4;
  data: Uint8Array;
}

export function sniffImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const mime = sniffImageMime(bytes);
  if (mime === "image/png") return readPngSize(bytes);
  if (mime === "image/jpeg") return readJpegSize(bytes);
  return null;
}

export function decodeRaster(bytes: Uint8Array): Raster | null {
  const mime = sniffImageMime(bytes);
  if (mime === "image/png") return decodePng(bytes);
  if (mime === "image/jpeg") return decodeJpeg(bytes);
  return null;
}

function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== "IHDR") return null;
  const width = readU32(bytes, 16);
  const height = readU32(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (length < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!width || !height) return null;
      return { width, height };
    }
    offset += length;
  }
  return null;
}

function decodePng(bytes: Uint8Array): Raster | null {
  if (bytes.length < 8) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return null;
    if (type === "IHDR") {
      width = readU32(bytes, dataStart);
      height = readU32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
  if (colorType !== 2 && colorType !== 6) return null;
  const channels: 3 | 4 = colorType === 6 ? 4 : 3;
  const packed = Buffer.concat(idat.map((part) => Buffer.from(part)));
  let inflated: Buffer;
  try {
    inflated = inflateSync(packed);
  } catch {
    return null;
  }
  const stride = width * channels;
  if (inflated.length < (stride + 1) * height) return null;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[dst + x - channels] : 0;
      const up = y > 0 ? out[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[dst - stride + x - channels] : 0;
      const raw = inflated[src + x];
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) return null;
      out[dst + x] = value;
    }
  }
  return { width, height, channels, data: out };
}

function decodeJpeg(bytes: Uint8Array): Raster | null {
  try {
    const decoded = decodeJpegBytes(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 16,
    });
    if (!decoded.width || !decoded.height || decoded.data.length < decoded.width * decoded.height * 4) return null;
    return { width: decoded.width, height: decoded.height, channels: 4, data: decoded.data };
  } catch {
    return null;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
