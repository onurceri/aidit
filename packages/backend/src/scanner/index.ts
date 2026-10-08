import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { getEnabledPaths, type PathEntry } from '../registry/pathRegistry.js';
import { insertScanRun } from '../db/scanRuns.js';
import { upsertDiscoveredFile } from '../db/discoveredFiles.js';
import { readConfig } from './readConfig.js';
import { getAgentInfo } from '../registry/agents.js';
import { scanSkillsDir } from './skillsScanner.js';
import { isGlobPattern, expandGlob } from './pathResolver.js';
import type { ScanResult, AgentResult, ConfigResult, SkillsDirResult, ScanError } from './types.js';

function detectOS(): ScanResult['os'] {
  const plat = process.platform;
  if (plat === 'darwin') return 'macos';
  if (plat === 'linux') return 'linux';
  return 'windows-wsl';
}

interface ScanOptions {
  cwd?: string;
  triggeredBy?: 'startup' | 'manual' | 'file_change' | 'api';
}

export function scan(options?: ScanOptions): ScanResult {
  const startedAt = Date.now();
  const cwd = options?.cwd ?? process.cwd();
  const triggeredBy = options?.triggeredBy ?? 'manual';

  const workingDirectory = cwd;
  const errors: ScanError[] = [];
  const projectConfigs: ConfigResult[] = [];
  const agentMap = new Map<string, AgentResult>();

  function ensureAgent(id: string): AgentResult {
    const existing = agentMap.get(id);
    if (existing) return existing;
    const info = getAgentInfo(id);
    const agent: AgentResult = {
      id,
      label: info?.label ?? id,
      homepage: info?.homepage,
      found: false,
      configs: [],
      skillsDirs: [],
    };
    agentMap.set(id, agent);
    return agent;
  }

  let enabledPaths;
  try {
    enabledPaths = getEnabledPaths(cwd);
  } catch (err) {
    errors.push({
      message: `Failed to load path registry: ${err instanceof Error ? err.message : String(err)}`,
    });
    return buildResult(startedAt, workingDirectory, [], [], errors, triggeredBy);
  }

  for (const entry of enabledPaths) {
    const { id, path: rawPath, resolvedPath, type, scope, agent } = entry;
    if (agent) ensureAgent(agent);

    if (isGlobPattern(rawPath)) {
      let matches: string[];
      try {
        matches = expandGlob(rawPath, { cwd });
      } catch (err) {
        errors.push({
          pathEntryId: id,
          absolutePath: resolvedPath,
          message: `Glob expansion failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      if (matches.length === 0) continue;

      for (const matchPath of matches) {
        processConfigEntry(id, matchPath, type, scope, agent);
      }
    } else {
      if (!existsSync(resolvedPath)) continue;

      processConfigEntry(id, resolvedPath, type, scope, agent);
    }
  }

  function processConfigEntry(
    id: string,
    absolutePath: string,
    type: PathEntry['type'],
    scope: PathEntry['scope'],
    agent: PathEntry['agent'],
  ): void {
    if (type === 'mcp-config') {
      try {
        const configResult: ConfigResult = readConfig({
          pathEntryId: id,
          absolutePath,
          scope,
          agent: agent ?? null,
        });

        try {
          const df = upsertDiscoveredFile({
            path_entry_id: id,
            absolute_path: absolutePath,
            type: 'mcp-config',
            agent_id: agent ?? null,
            last_modified: configResult.lastModified,
            size_bytes: configResult.sizeBytes,
          });
          configResult.firstSeenAt = df.first_seen_at;
        } catch {
          // Non-fatal: discovered_files tracking failure shouldn't break scan
        }

        if (configResult.parseError) {
          errors.push({
            pathEntryId: id,
            absolutePath,
            message: `Parse error: ${configResult.parseError}`,
          });
        }

        if (agent) {
          const agentResult = ensureAgent(agent);
          agentResult.found = true;
          agentResult.configs.push(configResult);
        }
        if (!agent || scope === 'project') {
          projectConfigs.push(configResult);
        }
      } catch (err) {
        errors.push({
          pathEntryId: id,
          absolutePath,
          message: `Failed to process config: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else if (type === 'skills-dir') {
      try {
        const skillsResult: SkillsDirResult = scanSkillsDir(absolutePath, scope);

        if (skillsResult.skills.length === 0) return;

        try {
          upsertDiscoveredFile({
            path_entry_id: id,
            absolute_path: absolutePath,
            type: 'skills-dir',
            agent_id: agent ?? null,
            last_modified: new Date().toISOString(),
            size_bytes: 0,
          });
        } catch {
          // Non-fatal
        }

        if (agent) {
          const agentResult = ensureAgent(agent);
          agentResult.found = true;
          agentResult.skillsDirs.push(skillsResult);
        }
      } catch (err) {
        errors.push({
          pathEntryId: id,
          absolutePath,
          message: `Failed to scan skills dir: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  const agents = Array.from(agentMap.values());

  return buildResult(startedAt, workingDirectory, agents, projectConfigs, errors, triggeredBy);
}

function buildResult(
  startedAt: number,
  workingDirectory: string,
  agents: AgentResult[],
  projectConfigs: ConfigResult[],
  errors: ScanError[],
  triggeredBy: ScanOptions['triggeredBy'] = 'manual',
): ScanResult {
  const finishedAt = Date.now();
  const scannedAt = new Date().toISOString();

  let mcpTotal = 0;
  let skillsTotal = 0;

  for (const agent of agents) {
    for (const config of agent.configs) {
      mcpTotal += config.mcpServers.length;
    }
    for (const dir of agent.skillsDirs) {
      skillsTotal += dir.skills.length;
    }
  }
  for (const config of projectConfigs) {
    mcpTotal += config.mcpServers.length;
  }

  try {
    insertScanRun({
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
      agents_found: agents.filter((a) => a.found).length,
      mcp_total: mcpTotal,
      skills_total: skillsTotal,
      triggered_by: triggeredBy,
    });
  } catch {
    // Non-fatal: scan result is still valid without the DB row
  }

  return {
    scannedAt,
    workingDirectory,
    homeDir: homedir(),
    os: detectOS(),
    agents,
    projectConfigs,
    errors,
  };
}
