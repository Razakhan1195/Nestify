import type { ProviderMark } from "./provider-identity";

// Visible artwork bounds in the bundled originals. Position the original image;
// preserve its aspect ratio and colours, and remove only its surrounding padding.
const artwork: Record<ProviderMark, { width: number; height: number; bounds: [number, number, number, number] }> = {
  bell: { width: 240, height: 137, bounds: [0, 0, 240, 137] },
  telus: { width: 360, height: 70, bounds: [0, 0, 360, 70] },
  enbridge: { width: 420, height: 114, bounds: [6, 11, 414, 99] },
  elexicon: { width: 420, height: 440, bounds: [42, 44, 378, 398] },
  hydro: { width: 420, height: 203, bounds: [0, 0, 420, 203] },
  rogers: { width: 336, height: 336, bounds: [23, 140, 313, 195] },
};
export function providerBrandLayout(mark: ProviderMark | null, options: { compact?: boolean; identity?: boolean; wordmark?: boolean } = {}) {
  const width = options.compact ? 92 : options.identity || options.wordmark ? 116 : 72;
  const height = options.compact ? 36 : 44;
  const innerWidth = width - 12, innerHeight = height - 8;
  if (!mark) return { width, height, image: { width: innerWidth, height: innerHeight } };
  const asset = artwork[mark], [left, top, right, bottom] = asset.bounds;
  const scale = Math.min(innerWidth / (right - left), innerHeight / (bottom - top));
  return { width, height, image: {
    position: "absolute" as const,
    width: asset.width * scale, height: asset.height * scale,
    left: (width - (right - left) * scale) / 2 - left * scale,
    top: (height - (bottom - top) * scale) / 2 - top * scale,
  } };
}
