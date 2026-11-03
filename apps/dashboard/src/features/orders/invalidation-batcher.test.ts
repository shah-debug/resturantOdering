import { vi } from 'vitest';
import { InvalidationBatcher } from './invalidation-batcher';

describe('InvalidationBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a burst of order events into one refresh with every order', () => {
    const flushes: string[][] = [];
    const batcher = new InvalidationBatcher((ids) => flushes.push(ids), 400);
    for (const id of ['a', 'b', 'a', 'c', 'b']) {
      batcher.add(id);
    }
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(399);
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushes).toEqual([['a', 'b', 'c']]);
  });

  it('never delays an event by more than one window, even during a steady stream', () => {
    const flushes: string[][] = [];
    const batcher = new InvalidationBatcher((ids) => flushes.push(ids), 400);
    batcher.add('a');
    vi.advanceTimersByTime(300);
    batcher.add('b');
    vi.advanceTimersByTime(100);
    expect(flushes).toEqual([['a', 'b']]);
    batcher.add('c');
    vi.advanceTimersByTime(400);
    expect(flushes).toEqual([['a', 'b'], ['c']]);
  });

  it('drops pending work when the stream is stopped', () => {
    const flush = vi.fn();
    const batcher = new InvalidationBatcher(flush, 400);
    batcher.add('a');
    batcher.cancel();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
