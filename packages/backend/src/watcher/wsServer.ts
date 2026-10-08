import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { ScanResult } from '../scanner/types.js';
import { checkUpgrade, type SecurityOptions } from '../security.js';

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

const WS_PATH = '/ws/watch';

export function attachWsServer(httpServer: Server, options: SecurityOptions = {}): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    const rejection = checkUpgrade(req, options);
    if (rejection) {
      const status = rejection === 'unauthorized' ? '401 Unauthorized' : '403 Forbidden';
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

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

export function closeAllClients(): void {
  for (const ws of clients) {
    ws.terminate();
  }
  clients.clear();
}
