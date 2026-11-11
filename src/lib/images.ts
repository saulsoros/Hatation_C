import type { PhotoRecord } from '../db/library';

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i;

export function isImage(file: File): boolean {
  return IMAGE_TYPES.has(file.type.toLowerCase()) || IMAGE_EXT.test(file.name);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(timestamp: number | null): string {
  if (!timestamp) return 'Date unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp);
}

export async function inspectImage(file: File, relativePath: string): Promise<Pick<PhotoRecord, 'width' | 'height' | 'capturedAt'>> {
  let width = 0;
  let height = 0;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch { /* Unsupported decoder: keep the file in the library with unknown dimensions. */ }
  const match = file.name.match(/(?:IMG_|DSC_|PXL_)?(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/i);
  let capturedAt: number | null = null;
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
    if (Number.isFinite(parsed)) capturedAt = parsed;
  }
  void relativePath;
  return { width, height, capturedAt };
}
