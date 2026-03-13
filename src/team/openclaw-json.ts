import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getProfileDir } from '../config.js';
import type { AgentRole } from '../types.js';

const OPENCLAW_JSON = 'openclaw.json';

interface OpenclawAgentEntry {
  id: string;
  name?: string;
  default?: boolean;
  workspace: string;
  agentDir: string;
  role?: string;
}

interface OpenclawBinding {
  agentId: string;
  match: { channel: string; accountId: string };
}

interface OpenclawConfig {
  agents?: {
    defaults?: Record<string, unknown>;
    list?: OpenclawAgentEntry[];
  };
  bindings?: OpenclawBinding[];
  channels?: {
    feishu?: {
      enabled?: boolean;
      defaultAccount?: string;
      accounts?: Record<
        string,
        {
          appId?: string;
          appSecret?: string;
          dmPolicy?: string;
          groupPolicy?: string;
          allowFrom?: string[];
          groupAllowFrom?: string[];
          tools?: Record<string, unknown>;
        }
      >;
      [k: string]: unknown;
    };
  };
  tools?: {
    agentToAgent?: {
      enabled?: boolean;
      allow?: string[];
    };
  };
  [k: string]: unknown;
}

function openclawPath(profile: string): string {
  return join(getProfileDir(profile), OPENCLAW_JSON);
}

function toTildePath(absPath: string): string {
  const home = homedir();
  if (absPath.startsWith(home)) {
    return '~' + absPath.slice(home.length);
  }
  return absPath;
}

export type FeishuCredentials = Record<string, { appId: string; appSecret: string }>;

/**
 * 同步 openclaw.json：合并选中的 Agent 到 agents.list、bindings、channels.feishu.accounts、tools.agentToAgent.allow。
 * 每个角色使用 credentials[role.id] 的 appId/appSecret；若文件不存在则先创建最小结构再写入。
 */
export function syncOpenclawConfig(
  profile: string,
  roles: AgentRole[],
  credentials: FeishuCredentials,
): void {
  const path = openclawPath(profile);
  const root = getProfileDir(profile);
  let config: OpenclawConfig;

  if (existsSync(path)) {
    config = JSON.parse(readFileSync(path, 'utf-8')) as OpenclawConfig;
  } else {
    config = {
      agents: { list: [] },
      bindings: [],
      channels: { feishu: { enabled: true, accounts: {} } },
      tools: { agentToAgent: { enabled: true, allow: [] } },
    };
  }

  // agents.list
  if (!config.agents) config.agents = { list: [] };
  if (!Array.isArray(config.agents.list)) config.agents.list = [];
  const list = config.agents.list as OpenclawAgentEntry[];
  const existingIds = new Set(list.map((a) => a.id));
  const mainId = roles.find((r) => r.isMain)?.id;

  for (const role of roles) {
    const workspacePath = toTildePath(join(root, `workspace-${role.id}`));
    const agentDirPath = toTildePath(join(root, 'agents', role.id, 'agent'));
    const entry: OpenclawAgentEntry = {
      id: role.id,
      name: role.name,
      default: mainId === role.id,
      workspace: workspacePath,
      agentDir: agentDirPath,
    };
    const idx = list.findIndex((a) => a.id === role.id);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
  }

  // bindings
  if (!Array.isArray(config.bindings)) config.bindings = [];
  const bindings = config.bindings as OpenclawBinding[];
  const bindingAgentIds = new Set(bindings.filter((b) => b.match?.channel === 'feishu').map((b) => b.agentId));
  for (const role of roles) {
    if (!bindingAgentIds.has(role.id)) {
      bindings.push({
        agentId: role.id,
        match: { channel: 'feishu', accountId: role.id },
      });
    }
  }

  // channels.feishu.accounts（防御：现有可能为 null/非对象，先得到可写对象再赋值）
  if (!config.channels) config.channels = {};
  if (!config.channels.feishu || typeof config.channels.feishu !== 'object') {
    config.channels.feishu = { enabled: true, accounts: {} };
  }
  const existing = (config.channels.feishu as any).accounts;
  const feishuAccounts: Record<string, any> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};
  for (const role of roles) {
    const cred = credentials[role.id];
    if (!cred?.appId || !cred?.appSecret) continue;
    feishuAccounts[role.id] = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      dmPolicy: 'open',
      groupPolicy: 'open',
      allowFrom: ['*'],
      groupAllowFrom: ['*'],
      tools: { profile: 'full' },
    };
  }
  (config.channels.feishu as any).accounts = feishuAccounts;
  if (mainId && !(config.channels.feishu as any).defaultAccount) {
    (config.channels.feishu as any).defaultAccount = mainId;
  }

  // tools.agentToAgent.allow
  if (!config.tools) config.tools = {};
  if (!config.tools.agentToAgent) config.tools.agentToAgent = { enabled: true, allow: [] };
  const allow = config.tools.agentToAgent!.allow ?? [];
  if (!Array.isArray(allow)) config.tools.agentToAgent!.allow = [];
  const allowSet = new Set(allow as string[]);
  for (const role of roles) {
    allowSet.add(role.id);
  }
  config.tools.agentToAgent!.allow = Array.from(allowSet);

  mkdirSync(root, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 从 openclaw.json 中移除指定 Agent id（agents.list、bindings、channels.feishu.accounts、agentToAgent.allow）。
 */
export function removeFromOpenclawConfig(profile: string, agentIds: string[]): void {
  const path = openclawPath(profile);
  if (!existsSync(path)) return;

  const idSet = new Set(agentIds);
  const config = JSON.parse(readFileSync(path, 'utf-8')) as OpenclawConfig;

  if (Array.isArray(config.agents?.list)) {
    config.agents.list = config.agents.list.filter((a) => !idSet.has(a.id));
  }
  if (Array.isArray(config.bindings)) {
    config.bindings = config.bindings.filter((b) => !idSet.has(b.agentId));
  }
  if (config.channels?.feishu?.accounts && typeof config.channels.feishu.accounts === 'object') {
    for (const id of agentIds) {
      delete (config.channels.feishu.accounts as Record<string, unknown>)[id];
    }
  }
  if (Array.isArray(config.tools?.agentToAgent?.allow)) {
    config.tools.agentToAgent.allow = config.tools.agentToAgent.allow.filter((id) => !idSet.has(id));
  }

  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}
