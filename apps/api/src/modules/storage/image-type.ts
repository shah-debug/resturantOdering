import type { MenuImageType } from '@app/contracts';

export interface DetectedImage {
  contentType: MenuImageType;
  extension: 'jpg' | 'png' | 'webp';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  return (
    buffer.length >= offset + bytes.length &&
    bytes.every((byte, index) => buffer[offset + index] === byte)
  );
}

export function detectImageType(buffer: Buffer): DetectedImage | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(buffer, PNG_SIGNATURE)) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  return null;
}

export const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\/(products)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export function contentTypeForKey(key: string): MenuImageType | null {
  if (key.endsWith('.jpg')) {
    return 'image/jpeg';
  }
  if (key.endsWith('.png')) {
    return 'image/png';
  }
  if (key.endsWith('.webp')) {
    return 'image/webp';
  }
  return null;
}
