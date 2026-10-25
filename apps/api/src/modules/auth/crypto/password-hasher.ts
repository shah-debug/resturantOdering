import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

export interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  saltLength: number;
}

export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  cost: 2 ** 16,
  blockSize: 8,
  parallelization: 2,
  keyLength: 64,
  saltLength: 16,
};

const PREFIX = 'scrypt';

function deriveKey(password: string, salt: Buffer, params: ScryptParameters): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.cost,
    r: params.blockSize,
    p: params.parallelization,
    maxmem: 256 * params.cost * params.blockSize * params.parallelization,
  };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, params.keyLength, options, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

interface ParsedHash {
  params: ScryptParameters;
  salt: Buffer;
  key: Buffer;
}

function parseHash(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return null;
  }
  const [, cost, blockSize, parallelization, salt, key] = parts;
  const numbers = [cost, blockSize, parallelization].map((value) => Number(value));
  if (numbers.some((value) => !Number.isSafeInteger(value) || value <= 0) || !salt || !key) {
    return null;
  }
  const saltBuffer = Buffer.from(salt, 'base64');
  const keyBuffer = Buffer.from(key, 'base64');
  return {
    params: {
      cost: numbers[0] ?? 0,
      blockSize: numbers[1] ?? 0,
      parallelization: numbers[2] ?? 0,
      keyLength: keyBuffer.length,
      saltLength: saltBuffer.length,
    },
    salt: saltBuffer,
    key: keyBuffer,
  };
}

export class PasswordHasher {
  constructor(private readonly params: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.params.saltLength);
    const key = await deriveKey(password, salt, this.params);
    return [
      PREFIX,
      this.params.cost,
      this.params.blockSize,
      this.params.parallelization,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parseHash(encoded);
    if (!parsed) {
      return false;
    }
    const candidate = await deriveKey(password, parsed.salt, parsed.params);
    return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
  }

  needsRehash(encoded: string): boolean {
    const parsed = parseHash(encoded);
    return (
      !parsed ||
      parsed.params.cost !== this.params.cost ||
      parsed.params.blockSize !== this.params.blockSize ||
      parsed.params.parallelization !== this.params.parallelization ||
      parsed.params.keyLength !== this.params.keyLength
    );
  }
}
