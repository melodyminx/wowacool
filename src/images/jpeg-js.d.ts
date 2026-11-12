declare module "jpeg-js" {
  export function decode(
    data: Uint8Array | ArrayBuffer,
    options?: {
      useTArray?: boolean;
      formatAsRGBA?: boolean;
      maxResolutionInMP?: number;
    },
  ): { width: number; height: number; data: Uint8Array };
}
