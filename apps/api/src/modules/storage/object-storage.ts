import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { API_PREFIX } from '@app/contracts';
import { STORAGE_KEY_PATTERN } from './image-type.js';

export interface StoredObject {
  key: string;
  url: string;
}

export class StorageError extends Error {}

export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  abstract delete(key: string): Promise<void>;
}

function assertKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw new StorageError('Invalid storage key');
  }
}

export class LocalObjectStorage extends ObjectStorage {
  private readonly root: string;

  constructor(directory: string) {
    super();
    this.root = resolve(directory);
  }

  async put(key: string, body: Buffer): Promise<StoredObject> {
    assertKey(key);
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
    return { key, url: `/${API_PREFIX}/media/${key}` };
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await rm(join(this.root, key), { force: true });
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

export class SupabaseObjectStorage extends ObjectStorage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    assertKey(key);
    const response = await this.fetchFn(`${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'max-age=31536000',
        'x-upsert': 'false',
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new StorageError(`Object storage responded with HTTP ${response.status}`);
    }
    return { key, url: `${this.baseUrl}/storage/v1/object/public/${this.bucket}/${key}` };
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const response = await this.fetchFn(`${this.baseUrl}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new StorageError(`Object storage responded with HTTP ${response.status}`);
    }
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceRoleKey}`, apikey: this.serviceRoleKey };
  }
}
