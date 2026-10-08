#!/usr/bin/env node
// Creates a fake home directory and project full of agent configs and skills, so the
// dashboard can be demoed or screenshotted without touching anyone's real setup.
//
//   node scripts/demo/seed.mjs <dir>
//
// Produces <dir>/home (use as HOME) and <dir>/home/projects/acme-web (use as cwd).
// Every token below is a placeholder.

import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.aidit-demo');
const home = join(root, 'home');
const project = join(home, 'projects', 'acme-web');

rmSync(root, { recursive: true, force: true });

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

function write(base, rel, content, ageDays = 3) {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n',
  );
  const t = daysAgo(ageDays);
  utimesSync(file, t, t);
}

function skill(base, dir, name, description, body, ageDays) {
  write(
    base,
    `${dir}/${name}/SKILL.md`,
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n`,
    ageDays,
  );
}

const github = { type: 'http', url: 'https://api.githubcopilot.com/mcp/' };
const playwright = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };
const context7 = { command: 'npx', args: ['-y', '@upstash/context7-mcp'] };
const filesystem = {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '~/projects'],
};

// ── Claude Code ────────────────────────────────────────────────────────────
write(home, '.claude.json', {
  numStartups: 412,
  theme: 'dark',
  mcpServers: {
    github,
    linear: { type: 'http', url: 'https://mcp.linear.app/mcp' },
    sentry: { type: 'http', url: 'https://mcp.sentry.dev/mcp' },
    postgres: {
      command: 'uvx',
      args: ['postgres-mcp', '--access-mode=restricted'],
      env: { DATABASE_URI: 'postgresql://localhost:5432/acme_dev' },
    },
    playwright,
    context7,
  },
});

skill(
  home,
  '.claude/skills',
  'code-review',
  'Review a diff for correctness bugs first, style second. Use when asked to review a PR or branch.',
  `# Code review

1. Read the diff end to end before commenting.
2. Flag correctness issues with a concrete failing input.
3. Group nits at the end.

| Severity | Meaning |
| --- | --- |
| blocker | Wrong behaviour or data loss |
| major | Likely bug or missing test |
| nit | Style only |`,
  2,
);
skill(
  home,
  '.claude/skills',
  'release-notes',
  'Draft user-facing release notes from merged PRs since the last tag.',
  `# Release notes\n\n- Group changes into **Added**, **Changed**, **Fixed**.\n- Write for users, not reviewers.\n- Link each item to its PR.`,
  9,
);
skill(
  home,
  '.claude/skills',
  'db-migrations',
  'Write safe, reversible Postgres migrations with zero-downtime patterns.',
  `# Database migrations\n\nAlways add columns as nullable first, backfill in batches, then add constraints.\n\n\`\`\`sql\nALTER TABLE orders ADD COLUMN region text;\n\`\`\``,
  21,
);
skill(
  home,
  '.claude/skills',
  'pdf-tools',
  'Extract text and tables from PDFs, merge and split documents.',
  `# PDF tools\n\nUse \`pdftotext -layout\` for text and \`camelot\` for tables.`,
  40,
);
skill(
  home,
  '.claude/skills',
  'frontend-design',
  'Build polished, accessible UI with Tailwind and consistent spacing.',
  `# Frontend design\n\n- 4px spacing scale\n- One accent colour\n- Test light and dark themes`,
  6,
);

// ── Claude Desktop ────────────────────────────────────────────────────────
write(home, 'Library/Application Support/Claude/claude_desktop_config.json', {
  mcpServers: {
    filesystem,
    memory: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  },
});

// ── OpenAI Codex (TOML) ───────────────────────────────────────────────────
write(
  home,
  '.codex/config.toml',
  `model = "gpt-5-codex"
approval_policy = "on-request"

[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_TOKEN"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"
enabled = false
`,
  1,
);

// ── Cursor (JSONC with comments) ───────────────────────────────────────────
write(
  home,
  '.cursor/mcp.json',
  `{
  // Shared with the team: keep in sync with Claude Code
  "mcpServers": {
    "github": { "url": "https://api.githubcopilot.com/mcp/" },
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "figma": { "url": "https://mcp.figma.com/mcp" }
  }
}
`,
  4,
);
skill(
  home,
  '.cursor/skills',
  'tailwind-components',
  'Compose UI from small Tailwind components instead of one-off styles.',
  `# Tailwind components\n\nPrefer extracting a component after the third copy.`,
  12,
);

// ── Google Antigravity ─────────────────────────────────────────────────────
write(home, '.gemini/config/mcp_config.json', {
  mcpServers: {
    'cloud-run': { command: 'npx', args: ['-y', '@google-cloud/cloud-run-mcp'] },
    bigquery: { serverUrl: 'https://bigquery.googleapis.com/mcp', disabled: true },
  },
});

// ── GitHub Copilot CLI ─────────────────────────────────────────────────────
write(home, '.copilot/mcp-config.json', {
  mcpServers: { playwright: { type: 'local', ...playwright, tools: ['*'] } },
});

// ── Kiro ──────────────────────────────────────────────────────────────────
write(home, '.kiro/settings/mcp.json', {
  mcpServers: {
    'aws-docs': { command: 'uvx', args: ['awslabs.aws-documentation-mcp-server@latest'] },
    'aws-pricing': {
      command: 'uvx',
      args: ['awslabs.aws-pricing-mcp-server@latest'],
      disabled: true,
    },
  },
});
skill(
  home,
  '.kiro/skills',
  'cdk-patterns',
  'Idiomatic AWS CDK constructs for serverless services.',
  `# CDK patterns\n\nUse L2 constructs; drop to L1 only for missing features.`,
  15,
);

// ── opencode ──────────────────────────────────────────────────────────────
write(home, '.config/opencode/opencode.json', {
  $schema: 'https://opencode.ai/config.json',
  mcp: {
    context7: { type: 'remote', url: 'https://mcp.context7.com/mcp', enabled: true },
    filesystem: {
      type: 'local',
      command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '~/projects'],
      enabled: false,
    },
  },
});

// ── Goose (YAML) ──────────────────────────────────────────────────────────
write(
  home,
  '.config/goose/config.yaml',
  `GOOSE_PROVIDER: anthropic
extensions:
  developer:
    name: developer
    type: builtin
    enabled: true
  github:
    name: github
    type: stdio
    cmd: npx
    args: [-y, '@modelcontextprotocol/server-github']
    envs: {}
    enabled: true
    timeout: 300
`,
);

// ── Zed ───────────────────────────────────────────────────────────────────
write(home, '.config/zed/settings.json', {
  theme: 'One Dark',
  context_servers: { 'postgres-context': { command: 'npx', args: ['-y', 'mcp-postgres'] } },
});

// ── Shared Agent Skills (~/.agents/skills) ───────────────────────────────
skill(
  home,
  '.agents/skills',
  'brand-voice',
  'Write in the Acme voice: plain, direct, no hype. Use for docs and UI copy.',
  `# Brand voice\n\n- Short sentences.\n- Say what it does, not how great it is.`,
  30,
);
skill(
  home,
  '.agents/skills',
  'incident-runbook',
  'Triage production incidents: stabilise, communicate, then investigate.',
  `# Incident runbook\n\n1. Page the on-call.\n2. Post status every 30 minutes.\n3. Write the timeline while it is fresh.`,
  18,
);
skill(
  home,
  '.agents/skills',
  'sql-style',
  'House style for SQL: lowercase keywords, CTEs over subqueries.',
  `# SQL style\n\n\`\`\`sql\nwith recent as (select * from orders where created_at > now() - interval '7 days')\nselect count(*) from recent;\n\`\`\``,
  25,
);

// ── Project: ~/projects/acme-web ─────────────────────────────────────────
write(project, '.mcp.json', {
  mcpServers: {
    'acme-api': { type: 'http', url: 'http://localhost:8787/mcp' },
    storybook: { command: 'npx', args: ['-y', 'storybook-mcp'] },
  },
});
write(project, '.vscode/mcp.json', {
  servers: { 'acme-api': { type: 'http', url: 'http://localhost:8787/mcp' } },
});
skill(
  project,
  '.claude/skills',
  'deploy-checklist',
  'Steps to ship acme-web to production safely.',
  `# Deploy checklist\n\n- [ ] Migrations reviewed\n- [ ] Feature flags set\n- [ ] Rollback plan written`,
  1,
);
write(project, 'package.json', { name: 'acme-web', private: true });

console.log(JSON.stringify({ home, project }));
