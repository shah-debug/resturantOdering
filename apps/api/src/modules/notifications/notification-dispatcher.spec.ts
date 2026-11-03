import { vi } from 'vitest';
import type { ErrorContext } from '../../common/observability/error-reporter';
import type { AppConfig } from '../../config/app-config';
import type { PrismaService } from '../../database/prisma.service';
import { NotificationDispatcher } from './notification-dispatcher.service';

function deferred() {
  let resolve: (value: unknown[]) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<unknown[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const claim = deferred();
  const queryRaw = vi.fn(() => claim.promise);
  const reports: { error: unknown; context: ErrorContext }[] = [];
  const dispatcher = new NotificationDispatcher(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    { send: vi.fn() },
    { notificationDispatchIntervalSeconds: 1 } as AppConfig,
    { report: (error, context) => reports.push({ error, context }) },
  );
  return { claim, queryRaw, reports, dispatcher };
}

describe('NotificationDispatcher shutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the batch in progress before letting shutdown continue', async () => {
    const { claim, queryRaw, dispatcher } = setup();
    dispatcher.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = dispatcher.onModuleDestroy().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    claim.resolve([]);
    await stopping;
    expect(stopped).toBe(true);
  });

  it('never overlaps batches and reports failures to error monitoring', async () => {
    const { claim, queryRaw, reports, dispatcher } = setup();
    dispatcher.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3000);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    claim.reject(new Error('connection reset'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reports).toEqual([
      {
        error: expect.objectContaining({ message: 'connection reset' }) as unknown,
        context: { source: 'worker', task: 'notification-dispatch' },
      },
    ]);
    await dispatcher.onModuleDestroy();
  });
});
