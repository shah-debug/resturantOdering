import { type OrderEvent, orderEventSchema } from '@app/contracts';

export type StreamStatus = 'connecting' | 'live' | 'offline';

export const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export interface OrderStreamHandlers {
  onStatus: (status: StreamStatus) => void;
  onReady: () => void;
  onEvent: (event: OrderEvent) => void;
}

export interface TimerApi {
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout>) => void;
}

const browserTimers: TimerApi = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle),
};

export function reconnectDelay(failures: number): number {
  return RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)] ?? 60_000;
}

export class OrderStream {
  private source: EventSourceLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private stopped = true;

  constructor(
    private readonly url: string,
    private readonly handlers: OrderStreamHandlers,
    private readonly createSource: (url: string) => EventSourceLike = (url) =>
      new EventSource(url, { withCredentials: true }),
    private readonly timers: TimerApi = browserTimers,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.source?.close();
    this.source = null;
  }

  reconnectNow(): void {
    if (this.stopped || this.source) {
      return;
    }
    this.clearTimer();
    this.open();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private open(): void {
    this.handlers.onStatus(this.failures > 1 ? 'offline' : 'connecting');
    const source = this.createSource(this.url);
    this.source = source;
    source.addEventListener('ready', () => {
      this.failures = 0;
      this.handlers.onStatus('live');
      this.handlers.onReady();
    });
    source.addEventListener('order', (message) => {
      try {
        const parsed = orderEventSchema.safeParse(JSON.parse(message.data));
        if (parsed.success) {
          this.handlers.onEvent(parsed.data);
        }
      } catch {
        return;
      }
    });
    source.onerror = () => {
      source.close();
      if (this.source !== source || this.stopped) {
        return;
      }
      this.source = null;
      const delay = reconnectDelay(this.failures);
      this.failures += 1;
      this.handlers.onStatus(this.failures > 1 ? 'offline' : 'connecting');
      this.timer = this.timers.set(() => {
        this.timer = null;
        if (!this.stopped) {
          this.open();
        }
      }, delay);
    };
  }
}
