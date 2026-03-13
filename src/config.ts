import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentTeamConfig } from './types.js';

/**
 * 将 profile 名称映射到对应的 ~/.openclaw{-name}/ 目录。
 * profile 为空字符串时表示默认目录 ~/.openclaw/
 */
export function getProfileDir(profile: string): string {
  return profile
    ? join(homedir(), `.openclaw-${profile}`)
    : join(homedir(), '.openclaw');
}

export function getConfigPath(profile: string): string {
  return join(getProfileDir(profile), 'team-config.json');
}

export function loadConfig(profile: string): AgentTeamConfig | null {
  const configPath = getConfigPath(profile);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as AgentTeamConfig;
  } catch {
    return null;
  }
}

export function saveConfig(profile: string, config: AgentTeamConfig): void {
  const configPath = getConfigPath(profile);
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function requireConfig(profile: string): AgentTeamConfig {
  const config = loadConfig(profile);
  if (!config) {
    const hint = profile
      ? `openclaw-team init --profile ${profile}`
      : 'openclaw-team init';
    throw new Error(`团队配置不存在，请先运行 ${hint}`);
  }
  return config;
}

/**
 * 从团队配置中获取允许作为任务负责人的成员名称列表（agents 中各 entry 的 role）。
 * 用于 CLI 校验 task create/update/flow 的 assignee/next-assignee 必须在其中。
 */
export function getMemberNames(config: AgentTeamConfig): string[] {
  if (!config.agents || typeof config.agents !== 'object') return [];
  return Array.from(new Set(Object.values(config.agents).map((e) => e.role).filter(Boolean)));
}

/**
 * 生成 openclaw CLI 的 --profile flag 片段。
 * profile 为空字符串时不追加 flag（使用 openclaw 默认目录）。
 */
export function profileFlag(profile: string): string {
  return profile ? `--profile ${profile}` : '';
}

/**
 * 扫描 ~/.openclaw/ 和 ~/.openclaw-* 目录，
 * 返回已存在 openclaw.json 的 profile 列表。
 * 空字符串 '' 代表默认 profile（~/.openclaw/）。
 */
export function listOpenclawProfiles(): string[] {
  const home = homedir();
  const result: string[] = [];

  try {
    // 默认 profile
    if (existsSync(join(home, '.openclaw', 'openclaw.json'))) {
      result.push('');
    }

    // 命名 profile
    readdirSync(home, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('.openclaw-'))
      .map((d) => d.name.replace(/^\.openclaw-/, ''))
      .filter((name) => name.length > 0 && existsSync(join(home, `.openclaw-${name}`, 'openclaw.json')))
      .forEach((name) => result.push(name));
  } catch {
    // ignore
  }

  return result;
}

/**
 * 扫描已初始化过 openclaw-team 的 profile 列表。
 * 空字符串 '' 代表默认 profile（~/.openclaw/）。
 */
export function listTeamProfiles(): string[] {
  const home = homedir();
  const result: string[] = [];

  try {
    // 默认 profile
    if (existsSync(join(home, '.openclaw', 'team-config.json'))) {
      result.push('');
    }

    // 命名 profile
    readdirSync(home, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('.openclaw-'))
      .map((d) => d.name.replace(/^\.openclaw-/, ''))
      .filter((name) => name.length > 0 && existsSync(join(home, `.openclaw-${name}`, 'team-config.json')))
      .forEach((name) => result.push(name));
  } catch {
    // ignore
  }

  return result;
}

/**
 * 自动检测 profile：
 * 优先级: env OPENCLAW_TEAM_PROFILE → 已有 team-config 唯一值 → null
 *
 * 注意：env 设置为 "default" 时等同于空字符串（使用默认目录）。
 */
export function autoDetectProfile(): string | null {
  const envProfile = process.env['OPENCLAW_TEAM_PROFILE'];
  if (envProfile !== undefined) {
    return envProfile === 'default' ? '' : envProfile;
  }

  const teamProfiles = listTeamProfiles();
  if (teamProfiles.length === 1) return teamProfiles[0]!;

  return null;
}
