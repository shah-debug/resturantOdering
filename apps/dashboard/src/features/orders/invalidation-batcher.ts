export interface BatchTimers {
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout>) => void;
}

const browserTimers: BatchTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle),
};

export const INVALIDATION_BATCH_MS = 400;

export class InvalidationBatcher {
  private readonly orderIds = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flushTo: (orderIds: string[]) => void,
    private readonly delayMs = INVALIDATION_BATCH_MS,
    private readonly timers: BatchTimers = browserTimers,
  ) {}

  add(orderId: string): void {
    this.orderIds.add(orderId);
    this.timer ??= this.timers.set(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (this.orderIds.size === 0) {
      return;
    }
    const ids = [...this.orderIds];
    this.orderIds.clear();
    this.flushTo(ids);
  }

  cancel(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    this.orderIds.clear();
  }
}
