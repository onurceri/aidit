import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep tests away from the real ~/.config/aidit. Must run before any module
// that reads these at import time (src/dataDir.ts, src/db/db.ts).
process.env.AIDIT_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'aidit-test-'));
process.env.AIDIT_DB_PATH ??= ':memory:';
