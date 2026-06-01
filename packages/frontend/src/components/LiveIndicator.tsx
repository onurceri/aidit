import { useWatcher } from '../hooks/useWatcher';

export function LiveIndicator() {
  const { status } = useWatcher();
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  const label = isConnected ? 'Live' : isConnecting ? 'Connecting' : 'Offline';

  return (
    <div className="flex items-center gap-2 px-2 h-8 text-xs text-fg-2">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          isConnected ? 'bg-fg' : 'bg-fg-3'
        }`}
        aria-hidden
      />
      <span className="font-medium">{label}</span>
    </div>
  );
}
