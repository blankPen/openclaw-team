import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { profileFlag } from '../config.js';
import type { AgentRole } from '../types.js';
import { getTemplateDir } from './templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CreateAgentResult {
  agentId: string;
  workspaceDir: string;
}

/**
 * 通过 openclaw CLI 创建 agent
 */
export function createAgent(
  profile: string,
  role: AgentRole,
  workspaceDir: string,
): string {
  const cmd = [
    `openclaw`,
    profileFlag(profile),
    `agents add "${role.id}"`,
    `--workspace "${workspaceDir}"`,
    `--non-interactive`,
    '--json',
  ]
    .filter(Boolean)
    .join(' ');

  const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

  try {
    const result = JSON.parse(output);
    return result.id ?? role.id;
  } catch {
    return role.id;
  }
}

/**
 * 为 Agent 创建 cron 定时任务（从指定模板目录读取 cron-prompts）
 */
export function createCronJob(
  profile: string,
  role: AgentRole,
  groupId: string,
  interval: string = '10m',
  templateId: string = 'standard-dev',
): string {
  const templateDir = getTemplateDir(templateId);
  const promptFile = role.isMain
    ? join(templateDir, 'cron-prompts/pm-check.md')
    : join(templateDir, 'cron-prompts/worker-check.md');

  if (!existsSync(promptFile)) {
    throw new Error(`定时任务模板不存在: ${promptFile}`);
  }
  let prompt = readFileSync(promptFile, 'utf-8');
  prompt = prompt.replace(/\{角色名\}/g, role.name).replace(/\{role_name\}/g, role.name);

  const jobName = `${role.id}-task-check`;
  const cmd = [
    `openclaw`,
    profileFlag(profile),
    `cron add`,
    `--agent "${role.id}"`,
    `--name "${jobName}"`,
    `--every ${interval}`,
    `--session isolated`,
    `--announce`,
    `--channel feishu`,
    `--to "${groupId}"`,
    `--message ${JSON.stringify(prompt)}`,
    '--json',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const result = JSON.parse(output);
    return result.id ?? jobName;
  } catch {
    return jobName;
  }
}

/**
 * 检查 agent 是否已存在
 */
export function agentExists(profile: string, agentId: string): boolean {
  try {
    const cmd = ['openclaw', profileFlag(profile), 'agents list --json']
      .filter(Boolean)
      .join(' ');
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const agents = JSON.parse(output);
    return Array.isArray(agents) && agents.some((a: any) => a.id === agentId);
  } catch {
    return false;
  }
}
