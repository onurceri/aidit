import { useContext, useEffect, useRef } from 'react';
import { WsContext, type WsContextValue } from '../context/WsContext';
import type { WsEvent } from '../api/client';

export function useWatcher(): WsContextValue {
  const context = useContext(WsContext);
  if (context === null) {
    throw new Error('useWatcher must be used within a WsProvider');
  }
  return context;
}

export function useConfigWatch(pathEntryId: string | undefined, onChanged: () => void) {
  const { subscribe, unsubscribe } = useWatcher();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathEntryIdRef = useRef(pathEntryId);
  const onChangedRef = useRef(onChanged);

  pathEntryIdRef.current = pathEntryId;
  onChangedRef.current = onChanged;

  useEffect(() => {
    const handler = (event: WsEvent) => {
      const currentId = pathEntryIdRef.current;
      if (!currentId || event.pathEntryId !== currentId) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onChangedRef.current();
      }, 300);
    };

    subscribe('config:changed', handler);

    return () => {
      unsubscribe('config:changed', handler);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [subscribe, unsubscribe]);
}
