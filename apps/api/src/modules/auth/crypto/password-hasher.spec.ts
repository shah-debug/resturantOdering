import { PasswordHasher, type ScryptParameters } from './password-hasher';
import { hashToken, issueToken } from './secure-token';

const fastParams: ScryptParameters = {
  cost: 2 ** 10,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltLength: 16,
};

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(fastParams);

  it('verifies the original password and rejects others', async () => {
    const encoded = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('correct horse battery staple', encoded)).toBe(true);
    expect(await hasher.verify('correct horse battery stapl', encoded)).toBe(false);
  });

  it('salts every hash', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('same password'),
      hasher.hash('same password'),
    ]);
    expect(first).not.toBe(second);
  });

  it('encodes the parameters so they can be upgraded later', async () => {
    const encoded = await hasher.hash('a password value');
    expect(encoded).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hasher.needsRehash(encoded)).toBe(false);
    expect(new PasswordHasher({ ...fastParams, cost: 2 ** 11 }).needsRehash(encoded)).toBe(true);
  });

  it('verifies hashes made with older parameters', async () => {
    const encoded = await new PasswordHasher({ ...fastParams, cost: 2 ** 11 }).hash('upgrade me');
    expect(await hasher.verify('upgrade me', encoded)).toBe(true);
  });

  it('normalizes unicode so equivalent input verifies', async () => {
    const encoded = await hasher.hash('café password');
    expect(await hasher.verify('café password', encoded)).toBe(true);
  });

  it.each(['', 'plain', 'bcrypt$1$2$3$4$5', 'scrypt$x$8$1$c2FsdA==$a2V5'])(
    'rejects malformed hash %j without throwing',
    async (encoded) => {
      expect(await hasher.verify('anything', encoded)).toBe(false);
      expect(hasher.needsRehash(encoded)).toBe(true);
    },
  );
});

describe('secure tokens', () => {
  it('issues 256-bit url-safe tokens and stores only a SHA-256 hash', () => {
    const { token, tokenHash } = issueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(tokenHash);
    expect(tokenHash).not.toContain(token);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => issueToken().token));
    expect(tokens.size).toBe(100);
  });
});
