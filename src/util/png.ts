import { deflateSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

export interface PngOptions {
  width: number;
  height: number;
  /** RGB 0-255 */
  color: [number, number, number];
  /** 在画面上叠一条对比色带，便于区分多张占位图 */
  band?: number;
}

/** 把已经排好的 RGB 像素写成不依赖第三方库的 PNG。 */
export function encodeRgbPng(width: number, height: number, rgb: Uint8Array): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("PNG 尺寸不正确");
  }
  if (rgb.length !== width * height * 3) throw new Error("RGB 长度不正确");
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, row + 1);
  }
  return wrapPng(width, height, raw);
}

/** 生成不依赖第三方库的有效 PNG（竖版占位图） */
export function encodePng(options: PngOptions): Buffer {
  const { width, height, color, band = 0 } = options;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const bandY0 = Math.floor(height * (0.1 + (band % 8) * 0.08));
  const bandY1 = bandY0 + Math.max(12, Math.floor(height * 0.04));
  const accent: [number, number, number] = [
    255 - color[0],
    255 - color[1],
    255 - color[2],
  ];
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    const useAccent = y >= bandY0 && y < bandY1;
    const [r, g, b] = useAccent ? accent : color;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return wrapPng(width, height, raw);
}

function wrapPng(width: number, height: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PALETTE: Array<[number, number, number]> = [
  [232, 104, 104],
  [94, 156, 232],
  [92, 196, 140],
  [240, 184, 80],
  [176, 128, 232],
  [80, 196, 196],
  [232, 140, 96],
  [120, 144, 232],
];

export function placeholderPng(index: number, width = 750, height = 1000): Buffer {
  return encodePng({
    width,
    height,
    color: PALETTE[index % PALETTE.length],
    band: index,
  });
}
