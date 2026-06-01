import { useContext } from 'react';
import { ScanContext, type ScanContextValue } from '../context/ScanContext';

export function useScan(): ScanContextValue {
  const context = useContext(ScanContext);
  if (context === null) {
    throw new Error('useScan must be used within a ScanProvider');
  }
  return context;
}
