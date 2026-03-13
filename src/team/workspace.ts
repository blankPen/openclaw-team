import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import type { AgentRole } from '../types.js';
import { getTemplateDir, getTemplatesDir } from './templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readTemplateFromDir(templateDir: string, filename: string): string | null {
  const filePath = join(templateDir, filename);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

export function createWorkspace(
  profile: string,
  role: AgentRole,
  teamName: string,
  bitableUrl: string,
  templateId: string,
): string {
  const workspaceDir = join(
    profile ? join(homedir(), `.openclaw-${profile}`) : join(homedir(), '.openclaw'),
    `workspace-${role.id}`,
  );
  mkdirSync(workspaceDir, { recursive: true });

  const templateDir = getTemplateDir(templateId);

  // 写入 AGENTS.md（从模板 agents-md/main.md 或 agents-md/worker.md + 变量替换）
  const agentsContent = renderAgentsMd(templateDir, profile, role, teamName, bitableUrl);
  writeFileSync(join(workspaceDir, 'AGENTS.md'), agentsContent, 'utf-8');

  // 写入 SOUL.md（从该模板目录 souls/<role.id>.md 读取）
  const soulContent =
    readTemplateFromDir(templateDir, `souls/${role.id}.md`);
  if (!soulContent) {
    throw new Error(`模板文件不存在: ${join(templateDir, `souls/${role.id}.md`)}`);
  }
  writeFileSync(join(workspaceDir, 'SOUL.md'), soulContent, 'utf-8');

  // 主 Agent 额外写入 TEAMWORK_FLOW.md（从该模板目录读取）
  if (role.isMain) {
    const flowContent =
      readTemplateFromDir(templateDir, 'TEAMWORK_FLOW.md');
    if (!flowContent) {
      throw new Error(`模板文件不存在: ${join(templateDir, 'TEAMWORK_FLOW.md')}`);
    }
    writeFileSync(join(workspaceDir, 'TEAMWORK_FLOW.md'), flowContent, 'utf-8');
  }

  return workspaceDir;
}

function replaceVars(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const key of Object.keys(vars)) {
    out = out.split(`{{${key}}}`).join(vars[key] ?? '');
  }
  return out;
}

const AGENTS_BASE_PATH = 'common/AGENTS_BASE.md';
const YOUR_AGENT_CONTENT_PLACEHOLDER = '{{YOUR_AGENT_CONTENT}}';

/**
 * 基于 templates/common/AGENTS_BASE.md 生成 AGENTS.md：将 {{YOUR_AGENT_CONTENT}} 替换为
 * 本模板 agents-md/main.md 或 worker.md 的内容（并做变量替换）。
 * 占位符：{{role.emoji}} {{role.name}} {{teamName}} {{bitableUrl}} {{taskCliBase}}
 */
function renderAgentsMd(
  templateDir: string,
  profile: string,
  role: AgentRole,
  teamName: string,
  bitableUrl: string,
): string {
  const taskCliBase = profile ? `openclaw-team --profile ${profile} task` : 'openclaw-team task';
  const vars: Record<string, string> = {
    'role.emoji': role.emoji ?? '',
    'role.name': role.name,
    teamName,
    bitableUrl,
    taskCliBase,
  };
  const basePath = join(getTemplatesDir(), AGENTS_BASE_PATH);
  const baseTpl = existsSync(basePath) ? readFileSync(basePath, 'utf-8') : null;

  const filename = role.isMain ? 'agents-md/main.md' : 'agents-md/worker.md';
  const agentPart = readTemplateFromDir(templateDir, filename);
  if (!agentPart) {
    throw new Error(`模板文件不存在: ${join(templateDir, filename)}`);
  }
  const agentContent = replaceVars(agentPart, vars);

  if (baseTpl && baseTpl.includes(YOUR_AGENT_CONTENT_PLACEHOLDER)) {
    return baseTpl.split(YOUR_AGENT_CONTENT_PLACEHOLDER).join(agentContent);
  }
  return agentContent;
}
