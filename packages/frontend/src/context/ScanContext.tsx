import { createContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import { fetchScan, type ScanResult, ApiError } from '../api/client';

interface ScanState {
  scanResult: ScanResult | null;
  loading: boolean;
  error: string | null;
  lastScanned: string | null;
}

type ScanAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: ScanResult }
  | { type: 'FETCH_ERROR'; payload: string };

const initialState: ScanState = {
  scanResult: null,
  loading: true,
  error: null,
  lastScanned: null,
};

function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return {
        scanResult: action.payload,
        loading: false,
        error: null,
        lastScanned: action.payload.scannedAt,
      };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
}

export interface ScanContextValue {
  scanResult: ScanResult | null;
  loading: boolean;
  error: string | null;
  lastScanned: string | null;
  refresh: () => Promise<void>;
}

export const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scanReducer, initialState);

  const refresh = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const result = await fetchScan();
      dispatch({ type: 'FETCH_SUCCESS', payload: result });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to fetch scan results';
      dispatch({ type: 'FETCH_ERROR', payload: message });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <ScanContext.Provider value={{ ...state, refresh }}>{children}</ScanContext.Provider>;
}
