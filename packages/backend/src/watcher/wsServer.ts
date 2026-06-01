import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { ScanResult } from '../scanner/types.js';

export interface ConfigChangedEvent {
  event: 'config:changed';
  pathEntryId: string;
  absolutePath: string;
  timestamp: string;
}

export interface ConfigAddedEvent {
  event: 'config:added';
  pathEntryId: string;
  absolutePath: string;
  timestamp: string;
}

export interface ConfigRemovedEvent {
  event: 'config:removed';
  pathEntryId: string;
  absolutePath: string;
  timestamp: string;
}

export interface RegistryUpdatedEvent {
  event: 'registry:updated';
  timestamp: string;
}

export interface ScanFullEvent {
  event: 'scan:full';
  data: ScanResult;
}

export type WsEvent =
  | ConfigChangedEvent
  | ConfigAddedEvent
  | ConfigRemovedEvent
  | RegistryUpdatedEvent
  | ScanFullEvent;

const clients = new Set<WebSocket>();

export function attachWsServer(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/watch' });

  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });
}

export function broadcast(event: WsEvent): void {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

export function getConnectionCount(): number {
  return clients.size;
}
