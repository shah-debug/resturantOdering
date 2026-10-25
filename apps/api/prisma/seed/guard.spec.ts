import { assertDevelopmentSeedAllowed } from './guard';

const HOST = 'aws-1-ap-south-1.pooler.supabase.com';
const DATABASE_URL = `postgresql://postgres.ref:secret-password@${HOST}:5432/postgres`;
const CONFIRM = [`--target-host=${HOST}`];

describe('assertDevelopmentSeedAllowed', () => {
  it.each(['production', 'test', 'staging', undefined])(
    'refuses when NODE_ENV is %s',
    (nodeEnv) => {
      expect(() =>
        assertDevelopmentSeedAllowed({ NODE_ENV: nodeEnv, DATABASE_URL }, CONFIRM),
      ).toThrow(/Refusing to seed/);
    },
  );

  it('refuses without a database URL', () => {
    expect(() => assertDevelopmentSeedAllowed({ NODE_ENV: 'development' }, CONFIRM)).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses a malformed database URL', () => {
    expect(() =>
      assertDevelopmentSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: 'not a url' }, CONFIRM),
    ).toThrow(/not a valid URL/);
  });

  it('refuses unless the target host is confirmed explicitly', () => {
    expect(() =>
      assertDevelopmentSeedAllowed({ NODE_ENV: 'development', DATABASE_URL }, []),
    ).toThrow(/--target-host=aws-1-ap-south-1\.pooler\.supabase\.com/);
  });

  it('refuses when the confirmed host does not match DATABASE_URL', () => {
    expect(() =>
      assertDevelopmentSeedAllowed({ NODE_ENV: 'development', DATABASE_URL }, [
        '--target-host=db.other-project.supabase.co',
      ]),
    ).toThrow(/Refusing to seed/);
  });

  it('describes the confirmed target without exposing credentials', () => {
    const target = assertDevelopmentSeedAllowed({ NODE_ENV: 'development', DATABASE_URL }, CONFIRM);
    expect(target.description).toBe(`${HOST}:5432/postgres`);
    expect(target.description).not.toContain('secret-password');
  });
});
