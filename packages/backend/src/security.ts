import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Request, Response, NextFunction } from 'express';

/**
 * aidit binds to 127.0.0.1, but a browser on the same machine can still be
 * tricked into talking to it: a malicious page can POST to http://127.0.0.1:<port>
 * (cross-site request) or rebind its own hostname to 127.0.0.1 (DNS rebinding).
 * Since aidit writes MCP configs — which contain commands agents will execute —
 * both must be blocked. These checks run on every API and WebSocket request.
 */

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Vite dev server origin port (see packages/frontend/vite.config.ts). */
const DEV_UI_PORT = 3000;

export interface SecurityOptions {
  token?: string;
  /** Allow the Vite dev server origin (http://localhost:3000) — dev mode only. */
  allowDevOrigin?: boolean;
}

function hostnameOf(hostHeader: string): string {
  // Strip port; keep IPv6 brackets.
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  return hostHeader.split(':')[0];
}

export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  return LOCAL_HOSTNAMES.has(hostnameOf(hostHeader).toLowerCase());
}

export function isAllowedOrigin(
  origin: string | undefined,
  serverPort: number | undefined,
  allowDevOrigin: boolean,
): boolean {
  if (origin === undefined) return true; // non-browser clients (curl, CLI) send no Origin
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  if (!LOCAL_HOSTNAMES.has(url.hostname.toLowerCase())) return false;
  const port = Number(url.port || 80);
  if (serverPort !== undefined && port === serverPort) return true;
  return allowDevOrigin && port === DEV_UI_PORT;
}

export function tokensMatch(expected: string, provided: string | undefined | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Host / Origin / Content-Type checks for every request. */
export function requestGuard(options: SecurityOptions) {
  const allowDev = Boolean(options.allowDevOrigin);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isAllowedHost(req.headers.host)) {
      res.status(403).json({ error: 'forbidden_host', message: 'Invalid Host header' });
      return;
    }

    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, req.socket.localPort, allowDev)) {
      res.status(403).json({ error: 'forbidden_origin', message: 'Cross-origin request denied' });
      return;
    }

    if (!SAFE_METHODS.has(req.method)) {
      // Browsers can send cross-site "simple" requests (text/plain, form posts)
      // without a preflight. Requiring JSON forces a preflight, which we never grant
      // to foreign origins.
      const hasBody =
        Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'];
      if (hasBody && !req.is('application/json')) {
        res.status(415).json({
          error: 'unsupported_media_type',
          message: 'Request body must be application/json',
        });
        return;
      }
    }

    next();
  };
}

/** CORS for the Vite dev server only. Production is same-origin and sends no CORS headers. */
export function devCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin, undefined, true)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'no-referrer');
  res.header('X-Frame-Options', 'DENY');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Resource-Policy', 'same-origin');
  res.header('Content-Security-Policy', "frame-ancestors 'none'");
  next();
}

export function tokenGuard(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    if (!tokensMatch(token, extractBearer(req.headers.authorization))) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid token' });
      return;
    }
    next();
  };
}

/** Same checks for the WebSocket upgrade request. Returns an error reason, or null if allowed. */
export function checkUpgrade(req: IncomingMessage, options: SecurityOptions): string | null {
  if (!isAllowedHost(req.headers.host)) return 'forbidden_host';
  if (!isAllowedOrigin(req.headers.origin, req.socket.localPort, Boolean(options.allowDevOrigin))) {
    return 'forbidden_origin';
  }
  if (options.token) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const provided = url.searchParams.get('token') ?? extractBearer(req.headers.authorization);
    if (!tokensMatch(options.token, provided)) return 'unauthorized';
  }
  return null;
}
