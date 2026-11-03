import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { StorageError } from './object-storage.js';

export const PRIVATE_DOCUMENT_KEY_PATTERN =
  /^[0-9a-f-]{36}\/billing\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export type DocumentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const EXTENSIONS: Record<DocumentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function extensionFor(type: DocumentType): string {
  return EXTENSIONS[type];
}

export function detectDocumentType(buffer: Buffer): DocumentType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

function assertKey(key: string): void {
  if (!PRIVATE_DOCUMENT_KEY_PATTERN.test(key)) {
    throw new StorageError('Invalid document key');
  }
}

export abstract class PrivateDocumentStore {
  abstract put(key: string, body: Buffer, contentType: DocumentType): Promise<void>;
  abstract read(key: string): Promise<Buffer | null>;
}

export class LocalPrivateDocumentStore extends PrivateDocumentStore {
  private readonly root: string;

  constructor(directory: string) {
    super();
    this.root = resolve(directory, '.private');
  }

  async put(key: string, body: Buffer): Promise<void> {
    assertKey(key);
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
  }

  async read(key: string): Promise<Buffer | null> {
    assertKey(key);
    try {
      return await readFile(join(this.root, key));
    } catch {
      return null;
    }
  }
}

export class SupabasePrivateDocumentStore extends PrivateDocumentStore {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceRoleKey}`, apikey: this.serviceRoleKey };
  }

  async put(key: string, body: Buffer, contentType: DocumentType): Promise<void> {
    assertKey(key);
    const response = await this.fetchFn(`${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': contentType, 'x-upsert': 'false' },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new StorageError(`Document storage responded with HTTP ${response.status}`);
    }
  }

  async read(key: string): Promise<Buffer | null> {
    assertKey(key);
    const response = await this.fetchFn(
      `${this.baseUrl}/storage/v1/object/authenticated/${this.bucket}/${key}`,
      { headers: this.headers(), signal: AbortSignal.timeout(20_000) },
    );
    if (response.status === 400 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new StorageError(`Document storage responded with HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
