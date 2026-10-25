export interface SeedTarget {
  databaseUrl: string;
  description: string;
}

const TARGET_FLAG = '--target-host=';

export function assertDevelopmentSeedAllowed(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
): SeedTarget {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      `Refusing to seed: NODE_ENV must be "development" (got "${env.NODE_ENV ?? 'unset'}"). ` +
        'The development seed never runs in test, staging or production.',
    );
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Refusing to seed: DATABASE_URL is not set.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is not a valid URL.');
  }

  const description = `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  const confirmedHost = argv.find((arg) => arg.startsWith(TARGET_FLAG))?.slice(TARGET_FLAG.length);
  if (confirmedHost !== parsed.hostname) {
    throw new Error(
      `Refusing to seed: confirm the target by passing ${TARGET_FLAG}${parsed.hostname} ` +
        `(DATABASE_URL points at ${description}). Never confirm a production host.`,
    );
  }

  return { databaseUrl, description };
}
