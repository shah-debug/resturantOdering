import { vi } from 'vitest';
import {
  type EventSourceLike,
  OrderStream,
  reconnectDelay,
  type StreamStatus,
} from './order-stream';

class FakeSource implements EventSourceLike {
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  close(): void {
    this.closed = true;
  }
}

const EVENT = {
  type: 'order.created',
  orderId: '018f0000-0000-7000-8000-0000000000aa',
  orderNumber: 12,
  branchId: '018f0000-0000-7000-8000-0000000000bb',
  status: 'PENDING',
  at: '2026-10-31T10:00:00.000Z',
};

function setup() {
  const sources: FakeSource[] = [];
  const statuses: StreamStatus[] = [];
  const onReady = vi.fn();
  const onEvent = vi.fn();
  const stream = new OrderStream(
    '/api/v1/organizations/x/orders/events',
    { onStatus: (status) => statuses.push(status), onReady, onEvent },
    () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
  );
  return { stream, sources, statuses, onReady, onEvent };
}

describe('OrderStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes live on the ready event and re-fetches', () => {
    const { stream, sources, statuses, onReady } = setup();
    stream.start();
    expect(statuses).toEqual(['connecting']);
    sources[0]?.emit('ready', '{}');
    expect(statuses.at(-1)).toBe('live');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('passes valid order events through and ignores malformed ones', () => {
    const { stream, sources, onEvent } = setup();
    stream.start();
    sources[0]?.emit('order', JSON.stringify(EVENT));
    sources[0]?.emit('order', 'not json');
    sources[0]?.emit('order', JSON.stringify({ ...EVENT, orderId: 'nope' }));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(EVENT);
  });

  it('reconnects with growing delays instead of a tight loop', () => {
    const { stream, sources, statuses } = setup();
    stream.start();
    sources[0]?.fail();
    expect(sources[0]?.closed).toBe(true);
    expect(statuses.at(-1)).toBe('connecting');

    vi.advanceTimersByTime(4_999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);

    sources[1]?.fail();
    expect(statuses.at(-1)).toBe('offline');
    vi.advanceTimersByTime(14_999);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(3);
    expect(statuses.at(-1)).toBe('offline');

    sources[2]?.emit('ready', '{}');
    expect(statuses.at(-1)).toBe('live');
    sources[2]?.fail();
    vi.advanceTimersByTime(5_000);
    expect(sources).toHaveLength(4);
  });

  it('caps the delay at one minute', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([
      5_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });

  it('reconnects immediately when asked while disconnected', () => {
    const { stream, sources } = setup();
    stream.start();
    stream.reconnectNow();
    expect(sources).toHaveLength(1);
    sources[0]?.fail();
    stream.reconnectNow();
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(sources).toHaveLength(2);
  });

  it('stops cleanly without reconnecting', () => {
    const { stream, sources } = setup();
    stream.start();
    stream.stop();
    expect(sources[0]?.closed).toBe(true);
    sources[0]?.fail();
    vi.advanceTimersByTime(120_000);
    expect(sources).toHaveLength(1);
  });
});
