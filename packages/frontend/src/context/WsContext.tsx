import { createContext, useReducer, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { WsEvent } from '../api/client';

type WsStatus = 'connecting' | 'connected' | 'disconnected';

type WsEventListener = (event: WsEvent) => void;

interface WsState {
  status: WsStatus;
  lastEvent: WsEvent | null;
}

type WsAction = { type: 'SET_STATUS'; status: WsStatus } | { type: 'SET_EVENT'; event: WsEvent };

const initialState: WsState = {
  status: 'connecting',
  lastEvent: null,
};

function wsReducer(state: WsState, action: WsAction): WsState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_EVENT':
      return { ...state, lastEvent: action.event };
    default:
      return state;
  }
}

export interface WsContextValue {
  status: WsStatus;
  lastEvent: WsEvent | null;
  subscribe: (eventType: string, callback: WsEventListener) => void;
  unsubscribe: (eventType: string, callback: WsEventListener) => void;
}

export const WsContext = createContext<WsContextValue | null>(null);

const MAX_BACKOFF = 30000;
const INITIAL_BACKOFF = 1000;

function buildWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/watch`;
}

export function WsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wsReducer, initialState);
  const listenersRef = useRef<Map<string, Set<WsEventListener>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundQueueRef = useRef<WsEvent[]>([]);
  const isBackgroundRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    dispatch({ type: 'SET_STATUS', status: 'connecting' });

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 0;
      dispatch({ type: 'SET_STATUS', status: 'connected' });
    };

    ws.onmessage = (raw) => {
      try {
        const event = JSON.parse(raw.data as string) as WsEvent;
        dispatch({ type: 'SET_EVENT', event });

        if (isBackgroundRef.current) {
          backgroundQueueRef.current.push(event);
        } else {
          const listeners = listenersRef.current.get(event.event);
          if (listeners) {
            for (const cb of listeners) {
              cb(event);
            }
          }
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      dispatch({ type: 'SET_STATUS', status: 'disconnected' });

      const delay = Math.min(
        backoffRef.current === 0 ? INITIAL_BACKOFF : backoffRef.current * 2,
        MAX_BACKOFF,
      );
      backoffRef.current = delay;

      timerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        isBackgroundRef.current = false;
        if (backgroundQueueRef.current.length > 0) {
          const queue = backgroundQueueRef.current;
          backgroundQueueRef.current = [];

          const latestByType = new Map<string, WsEvent>();
          for (const event of queue) {
            latestByType.set(event.event, event);
          }

          for (const [, event] of latestByType) {
            const listeners = listenersRef.current.get(event.event);
            if (listeners) {
              for (const cb of listeners) {
                cb(event);
              }
            }
          }
        }
      } else {
        isBackgroundRef.current = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const subscribe = useCallback((eventType: string, callback: WsEventListener) => {
    const map = listenersRef.current;
    let set = map.get(eventType);
    if (!set) {
      set = new Set();
      map.set(eventType, set);
    }
    set.add(callback);
  }, []);

  const unsubscribe = useCallback((eventType: string, callback: WsEventListener) => {
    const map = listenersRef.current;
    const set = map.get(eventType);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        map.delete(eventType);
      }
    }
  }, []);

  return (
    <WsContext.Provider
      value={{ status: state.status, lastEvent: state.lastEvent, subscribe, unsubscribe }}
    >
      {children}
    </WsContext.Provider>
  );
}
