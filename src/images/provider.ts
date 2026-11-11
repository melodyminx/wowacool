import { IMAGES_MAX, IMAGES_MIN } from "../constants.js";

export interface ImageSpec {
  prompt: string;
  index: number;
}

export interface GeneratedImage {
  index: number;
  prompt: string;
  mimeType: "image/png";
  filename: string;
  bytes: Buffer;
  provider: string;
}

export interface ImageProvider {
  readonly id: string;
  generate(specs: ImageSpec[]): Promise<GeneratedImage[]>;
}

export function assertImageCount(count: number): void {
  if (!Number.isInteger(count) || count < IMAGES_MIN || count > IMAGES_MAX) {
    throw new Error(`图片数量必须是 ${IMAGES_MIN}–${IMAGES_MAX} 张，收到 ${count}`);
  }
}

export function toImageSpecs(prompts: string[]): ImageSpec[] {
  assertImageCount(prompts.length);
  return prompts.map((prompt, i) => ({ prompt, index: i + 1 }));
}
