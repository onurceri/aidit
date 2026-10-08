# Security policy

## Supported versions

Only the latest minor release receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a vulnerability

**Please do not file a public GitHub issue for security problems.**

Open a [private security advisory](https://github.com/onurceri/aidit/security/advisories/new) with:

1. A description of the vulnerability and its impact.
2. Steps to reproduce, or a proof of concept.
3. The aidit version (`aidit --version`), Node.js version, and OS.

You should get an initial response within 72 hours. If the issue is confirmed, we will work with you on a fix and a coordinated disclosure timeline, and credit you in the advisory unless you prefer otherwise.

## Threat model

aidit edits files that tell AI agents which programs to execute (MCP server `command` entries). Anyone who can write to those files can run code as you, so the local API is treated as security-sensitive.

What aidit does to protect it:

- **Localhost only.** The server binds to `127.0.0.1`, never `0.0.0.0`, so it is not reachable from your network.
- **Host and Origin checks.** Requests whose `Host` header is not a loopback address are rejected (DNS-rebinding protection), and state-changing requests and WebSocket connections from foreign origins are refused. No permissive CORS headers are sent, so a web page you visit cannot drive the API from your browser.
- **Optional token auth.** `aidit start --token` requires a bearer token on every API request.
- **Safe writes.** Every write is validated, the previous file is backed up under `~/.config/aidit/backups/`, and the new content is written atomically (temp file + rename).
- **Your permissions only.** aidit never asks for `sudo` and only touches files your user can already read and write.
- **No telemetry.** aidit makes no outbound network requests.

In scope: anything that lets a remote party (a website, another machine on the network) read or modify config files through aidit, path traversal outside registered paths, command injection, and bypasses of the backup/validation pipeline.

Out of scope: attacks that require an attacker who can already run code as your user, and vulnerabilities in the agents whose configs aidit edits.
