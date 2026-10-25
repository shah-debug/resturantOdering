import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { detectImageType } from './image-type';
import { LocalObjectStorage, StorageError, SupabaseObjectStorage } from './object-storage';

const ORG = '01a17380-904e-749f-8cf8-f20a78952b36';
const FILE = '01a17380-988a-76c8-99a4-cc030248962d';
const KEY = `${ORG}/products/${FILE}.png`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe('detectImageType', () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'image/jpeg'],
    [PNG, 'image/png'],
    [Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'), 'image/webp'],
  ])('recognises %#', (buffer, type) => {
    expect(detectImageType(buffer)?.contentType).toBe(type);
  });

  it.each([
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['gif', Buffer.from('GIF89a......')],
    ['html', Buffer.from('<!doctype html><html></html>')],
    ['empty', Buffer.alloc(0)],
    ['truncated png', PNG.subarray(0, 4)],
  ])('rejects %s', (_label, buffer) => {
    expect(detectImageType(buffer)).toBeNull();
  });
});

describe('LocalObjectStorage', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'storage-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores, reads and deletes objects under server-generated keys', async () => {
    const storage = new LocalObjectStorage(directory);
    expect(await storage.put(KEY, PNG)).toEqual({ key: KEY, url: `/api/v1/media/${KEY}` });
    expect(await storage.read(KEY)).toEqual(PNG);
    await storage.delete(KEY);
    expect(await storage.read(KEY)).toBeNull();
  });

  it.each([
    '../../etc/passwd',
    `${ORG}/products/../../x.png`,
    `${ORG}/logos/${FILE}.png`,
    `${ORG}/products/${FILE}.svg`,
  ])('refuses unsafe key %s', async (key) => {
    await expect(new LocalObjectStorage(directory).put(key, PNG)).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});

describe('SupabaseObjectStorage', () => {
  it('uploads with the service key and returns the public URL', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    const storage = new SupabaseObjectStorage(
      'https://abc.supabase.co',
      'service-role-key-value',
      'menu-images',
      fetchFn,
    );
    const stored = await storage.put(KEY, PNG, 'image/png');

    expect(stored.url).toBe(`https://abc.supabase.co/storage/v1/object/public/menu-images/${KEY}`);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`https://abc.supabase.co/storage/v1/object/menu-images/${KEY}`);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer service-role-key-value');
    expect(headers.get('content-type')).toBe('image/png');
    expect(headers.get('x-upsert')).toBe('false');
  });

  it('reports failures without leaking the key', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('denied', { status: 403 })),
    );
    const storage = new SupabaseObjectStorage(
      'https://abc.supabase.co',
      'service-role-key-value',
      'menu-images',
      fetchFn,
    );
    const upload = storage.put(KEY, PNG, 'image/png');
    await expect(upload).rejects.toBeInstanceOf(StorageError);
    await expect(upload).rejects.not.toThrow(/service-role-key-value/);
  });
});
