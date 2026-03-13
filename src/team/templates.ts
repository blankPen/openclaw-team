import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AgentRole } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 模板根目录（按模板 id 分子目录，每目录含 preset.json、souls/、TEAMWORK_FLOW.md、cron-prompts/） */
export function getTemplatesDir(): string {
  return join(__dirname, '../../templates');
}

/** 指定模板 id 的目录路径，用于读取 souls、TEAMWORK_FLOW、cron-prompts */
export function getTemplateDir(templateId: string): string {
  return join(getTemplatesDir(), templateId);
}

/**
 * 角色注册表：id 需与 templates/souls/*.md 文件名一致，便于扩展。
 */
export const ROLE_REGISTRY: Record<string, AgentRole> = {
  pm: { id: 'pm', name: '项目经理', isMain: true, cronInterval: 600000, emoji: '🧑‍💼' },
  product: { id: 'product', name: '产品', isMain: false, cronInterval: 600000, emoji: '📋' },
  fe: { id: 'fe', name: '前端研发', isMain: false, cronInterval: 600000, emoji: '🎨' },
  be: { id: 'be', name: '后端研发', isMain: false, cronInterval: 600000, emoji: '⚙️' },
  qa: { id: 'qa', name: '测试', isMain: false, cronInterval: 600000, emoji: '🔍' },
  ops: { id: 'ops', name: '发布', isMain: false, cronInterval: 600000, emoji: '🚀' },
  dev: { id: 'dev', name: '研发', isMain: false, cronInterval: 600000, emoji: '🛠️' },
  copy: { id: 'copy', name: '文案', isMain: false, cronInterval: 600000, emoji: '✍️' },
  operation: { id: 'operation', name: '运营', isMain: false, cronInterval: 600000, emoji: '📢' },
};

function rolesByIds(ids: string[]): AgentRole[] {
  return ids.map((id) => ROLE_REGISTRY[id]).filter(Boolean);
}

export type TeamPresetId = string;

export interface TeamPreset {
  id: TeamPresetId;
  label: string;
  description: string;
  roles: AgentRole[];
}

interface PresetJson {
  id: string;
  label: string;
  description: string;
  roleIds: string[];
}

/** 从模板目录按 id 分组加载：扫描 templates/<id>/preset.json */
function loadPresetsFromDir(dir: string): TeamPreset[] {
  const presets: TeamPreset[] = [];
  if (!existsSync(dir)) return presets;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const presetPath = join(dir, e.name, 'preset.json');
    if (!existsSync(presetPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(presetPath, 'utf-8')) as PresetJson;
      if (!raw.id || !Array.isArray(raw.roleIds)) continue;
      presets.push({
        id: raw.id,
        label: raw.label ?? raw.id,
        description: raw.description ?? '',
        roles: rolesByIds(raw.roleIds),
      });
    } catch {
      // skip invalid preset
    }
  }
  return presets;
}

/** 内置模板：从 templates/<id>/preset.json 加载（默认三套：small-dev, standard-dev, content-ops）。 */
export function getBuiltInPresets(): TeamPreset[] {
  return loadPresetsFromDir(getTemplatesDir());
}

/**
 * 扩展模板。后续可从用户目录或网络合并，例如：
 * - ~/.openclaw-team/templates/
 * - 远程模板包
 */
export function getExtendedPresets(): TeamPreset[] {
  return [];
}

/** 供 init 使用的模板列表 = 内置 + 扩展。 */
export const TEAM_PRESETS: TeamPreset[] = [...getBuiltInPresets(), ...getExtendedPresets()];

/** 按 id 获取模板。 */
export function getTeamPreset(id: string): TeamPreset | undefined {
  return TEAM_PRESETS.find((p) => p.id === id);
}

/** 兼容旧逻辑：默认使用标准研发团队。 */
export const DEFAULT_TEAM_TEMPLATE: { roles: AgentRole[] } = {
  get roles() {
    const p = getTeamPreset('standard-dev');
    return p ? p.roles : rolesByIds(['pm', 'product', 'fe', 'be', 'qa', 'ops']);
  },
};

export function getAgentNames(roles?: AgentRole[]): string[] {
  return (roles ?? DEFAULT_TEAM_TEMPLATE.roles).map((r) => r.name);
}

export function getMainAgent(roles?: AgentRole[]): AgentRole {
  const list = roles ?? DEFAULT_TEAM_TEMPLATE.roles;
  return list.find((r) => r.isMain)!;
}

export function getWorkerAgents(roles?: AgentRole[]): AgentRole[] {
  const list = roles ?? DEFAULT_TEAM_TEMPLATE.roles;
  return list.filter((r) => !r.isMain);
}
