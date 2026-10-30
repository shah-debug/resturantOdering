'use client';

import { API_PREFIX, type OrderEvent } from '@app/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAppDispatch } from '@/store/hooks';
import { ordersApi } from './orders-api';
import { OrderStream, type StreamStatus } from './order-stream';

export const FALLBACK_POLL_MS = 60_000;
const MAX_INCOMING = 5;
const SOUND_KEY = 'orders:sound';

interface LiveOrdersValue {
  enabled: boolean;
  status: StreamStatus;
  incoming: OrderEvent[];
  dismiss: (orderId: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  refresh: () => void;
}

const LiveOrdersContext = createContext<LiveOrdersValue>({
  enabled: false,
  status: 'connecting',
  incoming: [],
  dismiss: () => undefined,
  soundEnabled: false,
  setSoundEnabled: () => undefined,
  refresh: () => undefined,
});

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function playChime(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.6);
    oscillator.onended = () => void context.close();
  } catch {
    return;
  }
}

export function eventsUrl(organizationId: string): string {
  return `/${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/orders/events`;
}

export function LiveOrdersProvider({
  organizationId,
  enabled,
  children,
}: {
  organizationId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [incoming, setIncoming] = useState<OrderEvent[]>([]);
  const [soundEnabled, setSoundState] = useState(readSoundPreference);
  const soundRef = useRef(soundEnabled);
  const streamRef = useRef<OrderStream | null>(null);

  const refresh = useCallback(() => {
    dispatch(ordersApi.util.invalidateTags([{ type: 'Order', id: 'LIST' }, 'OrderCounts']));
  }, [dispatch]);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return;
    }
    const stream = new OrderStream(eventsUrl(organizationId), {
      onStatus: setStatus,
      onReady: refresh,
      onEvent: (event) => {
        dispatch(
          ordersApi.util.invalidateTags([
            { type: 'Order', id: 'LIST' },
            { type: 'Order', id: event.orderId },
            'OrderCounts',
          ]),
        );
        if (event.type === 'order.created') {
          setIncoming((current) =>
            [event, ...current.filter((entry) => entry.orderId !== event.orderId)].slice(
              0,
              MAX_INCOMING,
            ),
          );
          if (soundRef.current) {
            playChime();
          }
        }
      },
    });
    streamRef.current = stream;
    stream.start();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        stream.reconnectNow();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stream.stop();
      streamRef.current = null;
    };
  }, [dispatch, enabled, organizationId, refresh]);

  const value = useMemo<LiveOrdersValue>(
    () => ({
      enabled,
      status,
      incoming,
      dismiss: (orderId) =>
        setIncoming((current) => current.filter((entry) => entry.orderId !== orderId)),
      soundEnabled,
      setSoundEnabled: (next) => {
        setSoundState(next);
        try {
          window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
        } catch {
          return;
        }
      },
      refresh,
    }),
    [enabled, incoming, refresh, soundEnabled, status],
  );

  return <LiveOrdersContext.Provider value={value}>{children}</LiveOrdersContext.Provider>;
}

export function useLiveOrders(): LiveOrdersValue {
  return useContext(LiveOrdersContext);
}

export function useFallbackPolling(): number {
  const { enabled, status } = useLiveOrders();
  return enabled && status === 'offline' ? FALLBACK_POLL_MS : 0;
}
