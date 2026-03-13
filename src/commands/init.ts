import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { mkdirSync, cpSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, getProfileDir, listOpenclawProfiles } from '../config.js';
import { BitableClient, parseBitableInput } from '../bitable/client.js';
import { buildFieldSchemas } from '../bitable/schema.js';
import {
  TEAM_PRESETS,
  getTeamPreset,
  getAgentNames,
  getMainAgent,
  type TeamPreset,
} from '../team/templates.js';
import { createWorkspace } from '../team/workspace.js';
import { createAgent, createCronJob } from '../team/setup.js';
import { syncOpenclawConfig } from '../team/openclaw-json.js';
import * as ui from '../ui.js';
import type { AgentTeamConfig, AgentRole } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC_DIR = join(__dirname, '../../skills');

/** 通过 --config 传入的 JSON 配置结构（非交互式 init） */
export interface InitConfigFile {
  /** OpenClaw profile，留空或省略为默认 ~/.openclaw/ */
  profile?: string;
  /** 团队模板 id：small-dev / standard-dev / content-ops */
  template: string;
  /** 飞书群组 ID，所有机器人共用 */
  feishuGroupId: string;
  /** 每个角色一个飞书应用：roleId -> { appId, appSecret }（配置文件中每项可加可选 name 作为角色显示名） */
  credentials: Record<string, { appId: string; appSecret: string }>;
  /** 由 credentials[].name 推导出的角色显示名，仅解析结果使用 */
  roleNames?: Record<string, string>;
  /** 不填或 null：创建新多维表格；字符串：已有多维表格 URL 或 App Token */
  bitable?: string | null;
  /** Cron 间隔，默认 10m */
  interval?: string;
  /** 已有配置时是否直接覆盖 */
  force?: boolean;
}

function loadInitConfig(configPath: string): InitConfigFile {
  const absPath = resolve(process.cwd(), configPath);
  if (!existsSync(absPath)) {
    throw new Error(`配置文件不存在: ${absPath}`);
  }
  const raw = JSON.parse(readFileSync(absPath, 'utf-8')) as unknown;
  if (!raw || typeof raw !== 'object') {
    throw new Error('配置文件必须是 JSON 对象');
  }
  const c = raw as Record<string, unknown>;
  if (!c.template || typeof c.template !== 'string') {
    throw new Error('配置文件缺少 template（small-dev / standard-dev / content-ops）');
  }
  if (!c.feishuGroupId || typeof c.feishuGroupId !== 'string') {
    throw new Error('配置文件缺少 feishuGroupId');
  }
  if (!c.credentials || typeof c.credentials !== 'object' || Array.isArray(c.credentials)) {
    throw new Error('配置文件缺少 credentials（对象：roleId -> { appId, appSecret }）');
  }
  const preset = getTeamPreset((c.template as string).trim().toLowerCase());
  if (!preset) {
    throw new Error(`未知的 template: ${c.template}，可选: small-dev, standard-dev, content-ops`);
  }
  const credentials = c.credentials as Record<string, { appId?: string; appSecret?: string; name?: string }>;
  for (const role of preset.roles) {
    const cred = credentials[role.id];
    if (!cred?.appId || !cred?.appSecret) {
      throw new Error(`配置文件 credentials 中缺少角色 "${role.id}" 的 appId 或 appSecret`);
    }
  }
  const roleNames: Record<string, string> = {};
  for (const r of preset.roles) {
    const n = credentials[r.id]?.name;
    if (n != null && String(n).trim().length > 0) roleNames[r.id] = String(n).trim();
  }

  return {
    profile: c.profile != null ? String(c.profile) : undefined,
    template: (c.template as string).trim().toLowerCase(),
    feishuGroupId: (c.feishuGroupId as string).trim(),
    credentials: Object.fromEntries(
      preset.roles.map((r) => [
        r.id,
        {
          appId: String(credentials[r.id]!.appId).trim(),
          appSecret: String(credentials[r.id]!.appSecret).trim(),
        },
      ]),
    ),
    roleNames: Object.keys(roleNames).length > 0 ? roleNames : undefined,
    bitable: c.bitable == null ? undefined : c.bitable === '' ? undefined : String(c.bitable).trim() || undefined,
    interval: c.interval != null ? String(c.interval) : undefined,
    force: c.force === true,
  };
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('初始化 OpenClaw Agent 团队任务管理系统')
    .option('--config <path>', '从 JSON 文件读取完整配置，跳过所有交互（适合 AI/脚本）')
    .option('--profile <name>', 'OpenClaw profile 名称（不指定则交互式选择）')
    .option('--interval <duration>', 'Cron 轮询间隔', '10m')
    .option('--bitable <url-or-token>', '使用已有多维表格（URL 或 App Token，可选后跟 table_id）')
    .option('--template <id>', '团队模板：small-dev / standard-dev / content-ops（不指定则交互选择）')
    .option('--dry-run', '预览但不执行', false)
    .option('--force', '强制覆盖已有配置', false)
    .action(async (opts) => {
      ui.banner();

      let profile: string;
      let agentPreset: TeamPreset;
      let selectedRoles: AgentRole[];
      let answers: { feishuGroupId: string; credentials: Record<string, { appId: string; appSecret: string }> };
      let bitableSource: string | undefined;
      let interval = opts.interval ?? '10m';
      let force = opts.force === true;

      if (opts.config) {
        const fileConfig = loadInitConfig(opts.config);
        profile = fileConfig.profile ?? opts.profile ?? '';
        if (profile === 'default') profile = '';
        agentPreset = getTeamPreset(fileConfig.template)!;
        selectedRoles = agentPreset.roles.map((r) => ({
          ...r,
          name:
            fileConfig.roleNames && fileConfig.roleNames[r.id] && fileConfig.roleNames[r.id].trim().length > 0
              ? fileConfig.roleNames[r.id].trim()
              : r.name,
        }));
        answers = { feishuGroupId: fileConfig.feishuGroupId, credentials: fileConfig.credentials };
        bitableSource = fileConfig.bitable ?? opts.bitable;
        interval = fileConfig.interval ?? opts.interval ?? '10m';
        force = force || fileConfig.force === true;
        ui.dim(`使用配置文件: ${resolve(process.cwd(), opts.config)}`);
      } else {
        const rawProfile: string | undefined = opts.profile;
        profile =
          rawProfile === undefined
            ? await promptProfile()
            : rawProfile === 'default'
              ? ''
              : rawProfile;

        const existing = loadConfig(profile);
        if (existing && !opts.force) {
          ui.warn(`已存在团队配置 (profile: ${profile})`);
          const { overwrite } = await inquirer.prompt([
            { type: 'confirm', name: 'overwrite', message: '是否覆盖现有配置？', default: false },
          ]);
          if (!overwrite) {
            ui.dim('已取消');
            return;
          }
        }

        ui.section('选择团队模板');
        agentPreset = await resolveAgentPreset(opts.template);
        selectedRoles = agentPreset.roles;

        ui.section('飞书应用凭证');
        answers = await collectConfig(selectedRoles);
        bitableSource = opts.bitable;
      }

      if (opts.config && loadConfig(profile) && !force) {
        ui.warn(`已存在团队配置 (profile: ${profile})，使用 --force 可覆盖`);
        process.exit(1);
      }
      if (!opts.config) {
        const existing = loadConfig(profile);
        if (existing && !force) {
          ui.warn(`已存在团队配置 (profile: ${profile})`);
          const { overwrite } = await inquirer.prompt([
            { type: 'confirm', name: 'overwrite', message: '是否覆盖现有配置？', default: false },
          ]);
          if (!overwrite) {
            ui.dim('已取消');
            return;
          }
        }
      }

      if (opts.dryRun) {
        ui.warn('[dry-run] 配置预览:');
        console.log(JSON.stringify({ profile, template: agentPreset.id, roles: selectedRoles.map((r) => r.name), feishuGroupId: answers.feishuGroupId, credentials: answers.credentials }, null, 2));
        return;
      }

      const mainAgentId = getMainAgent(selectedRoles).id;
      const mainCred = answers.credentials[mainAgentId];
      if (!mainCred?.appId || !mainCred?.appSecret) {
        ui.error('主 Agent 应用凭证缺失，无法创建/关联多维表格');
        process.exit(1);
      }

      ui.step(1, 6, '飞书多维表格');
      let appToken: string, tableId: string, bitableUrl: string;
      const useExisting = opts.config ? bitableSource : await resolveBitableSource(opts.bitable);
      try {
        if (useExisting) {
          const parsed = parseBitableInput(useExisting);
          const dummyConfig = { url: '', appToken: parsed.appToken, tableId: parsed.tableId ?? '' };
          const client = new BitableClient(mainCred.appId, mainCred.appSecret, dummyConfig);
          ({ appToken, tableId, url: bitableUrl } = await client.useExistingBitable(
            parsed.appToken,
            parsed.tableId,
            parsed.url,
          ));
          ui.success(`已关联多维表格`);
          ui.dim(bitableUrl);
        } else {
          ({ appToken, tableId, bitableUrl } = await createBitable(
            mainCred.appId,
            mainCred.appSecret,
            selectedRoles,
          ));
          ui.success('多维表格已创建');
          ui.dim(bitableUrl);
        }
      } catch (err: any) {
        ui.error(`多维表格失败: ${err.message}`);
        process.exit(1);
      }

      ui.step(2, 6, '创建 Agent 工作空间');
      const agentEntries: AgentTeamConfig['agents'] = {};

      for (const role of selectedRoles) {
        ui.working(`${role.emoji ?? ''} ${role.name} workspace`);
        const workspaceDir = createWorkspace(
          profile,
          role,
          profile || 'default',
          bitableUrl,
          agentPreset.id,
        );
        ui.done();

        ui.working(`${role.emoji ?? ''} ${role.name} agent 注册`);
        let agentId = role.id;
        try {
          agentId = createAgent(profile, role, workspaceDir);
          ui.done();
        } catch (err: any) {
          ui.skipped(err.message.slice(0, 60));
        }

        agentEntries[role.id] = { role: role.name, agentId };
      }

      ui.step(3, 6, '同步 openclaw.json');
      try {
        syncOpenclawConfig(profile, selectedRoles, answers.credentials);
        ui.success('openclaw.json 已同步');
      } catch (err: any) {
        ui.warn(`跳过 (${err.message.slice(0, 80)})`);
      }

      ui.step(4, 6, '保存配置');
      const config: AgentTeamConfig = {
        version: 1,
        teamName: profile || 'default',
        profile,
        mainAgent: mainAgentId,
        bitable: { url: bitableUrl, appToken, tableId },
        feishuGroupId: answers.feishuGroupId,
        feishuAppId: mainCred.appId,
        feishuAppSecret: mainCred.appSecret,
        agents: agentEntries,
        cronInterval: parseInterval(interval),
        skillsDir: join(homedir(), '.agents', 'skills'),
      };
      saveConfig(profile, config);
      ui.success('配置已保存');

      ui.step(5, 6, '安装 team-tasks Skill');
      installSkill(config.skillsDir);
      ui.success('team-tasks Skill 已安装');

      ui.step(6, 6, '创建 Cron 定时任务');
      for (const role of selectedRoles) {
        ui.working(`${role.emoji ?? ''} ${role.name} cron (${interval})`);
        try {
          const cronJobId = createCronJob(
            profile,
            role,
            answers.feishuGroupId,
            interval,
            agentPreset.id,
          );
          agentEntries[role.id].cronJobId = cronJobId;
          ui.done();
        } catch (err: any) {
          ui.skipped(err.message.slice(0, 60));
        }
      }

      // 更新配置（写入 cronJobId）
      saveConfig(profile, config);

      // 9. 输出摘要与加群提醒
      printSummary(profile, config, bitableUrl, selectedRoles);
    });
}

function profileLabel(p: string): string {
  return p === '' ? `默认 (~/.openclaw/)` : p;
}

async function promptProfile(): Promise<string> {
  const existing = listOpenclawProfiles();

  if (existing.length === 0) {
    // 没有检测到任何 openclaw profile，提供默认或手动输入
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: '选择 OpenClaw profile:',
        choices: [
          { name: '默认 (~/.openclaw/)', value: '' },
          { name: '手动输入 profile 名称', value: '__manual__' },
        ],
      },
    ]);

    if (choice === '__manual__') {
      const { profile } = await inquirer.prompt([
        {
          type: 'input',
          name: 'profile',
          message: 'OpenClaw profile 名称:',
          validate: (v: string) => v.trim().length > 0 || '不能为空',
        },
      ]);
      return profile as string;
    }
    return '';
  }

  if (existing.length === 1) {
    // 只有一个 profile，直接确认使用
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `检测到 OpenClaw profile: ${chalk.cyan(profileLabel(existing[0]!))}，使用该 profile？`,
        default: true,
      },
    ]);
    if (confirmed) return existing[0]!;
  }

  // 多个 profile 或用户拒绝，列出选项
  const choices = [
    ...existing.map((p) => ({ name: profileLabel(p), value: p })),
    { name: '手动输入 profile 名称', value: '__manual__' },
  ];

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: '选择 OpenClaw profile:',
      choices,
    },
  ]);

  if (selected === '__manual__') {
    const { profile } = await inquirer.prompt([
      {
        type: 'input',
        name: 'profile',
        message: 'OpenClaw profile 名称（留空使用默认）:',
      },
    ]);
    return (profile as string).trim();
  }

  return selected as string;
}

/**
 * 决定使用新建还是已有多维表格。
 * 返回 string 表示使用已有（值为 URL 或 app_token），返回 undefined 表示创建新的。
 */
/**
 * 解析团队模板：--template <id> 或交互选择模板。
 */
async function resolveAgentPreset(flagTemplate: string | undefined): Promise<TeamPreset> {
  if (flagTemplate?.trim()) {
    const preset = getTeamPreset(flagTemplate.trim().toLowerCase());
    if (preset) return preset;
    throw new Error(`未知的团队模板: ${flagTemplate}，可选: small-dev, standard-dev, content-ops`);
  }
  const { presetId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'presetId',
      message: '选择团队模板:',
      choices: TEAM_PRESETS.map((p) => ({
        name: `${p.label} — ${p.description}`,
        value: p.id,
      })),
    },
  ]);
  return getTeamPreset(presetId as string)!;
}

async function resolveBitableSource(flagBitable: string | undefined): Promise<string | undefined> {
  if (flagBitable?.trim()) {
    return flagBitable.trim();
  }
  const { source } = await inquirer.prompt([
    {
      type: 'list',
      name: 'source',
      message: '多维表格来源:',
      choices: [
        { name: '创建新的多维表格', value: 'new' },
        { name: '使用已有多维表格（输入 URL 或 App Token）', value: 'existing' },
      ],
    },
  ]);
  if (source === 'new') return undefined;
  const { existingInput } = await inquirer.prompt([
    {
      type: 'input',
      name: 'existingInput',
      message: '请输入多维表格 URL 或 App Token（仅 token 时将使用该 base 下第一个数据表）:',
      validate: (v: string) => v.trim().length > 0 || '不能为空',
    },
  ]);
  return (existingInput as string).trim();
}

async function collectConfig(roles: AgentRole[]): Promise<{
  feishuGroupId: string;
  credentials: Record<string, { appId: string; appSecret: string }>;
}> {
  const groupAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'feishuGroupId',
      message: '飞书群组 ID（所有机器人共用一个群，Cron 推送目标）:',
      validate: (v: string) => (v && v.trim().length > 0) || '不能为空',
    },
  ]);
  const feishuGroupId = (groupAnswer.feishuGroupId as string).trim();

  const credentials: Record<string, { appId: string; appSecret: string }> = {};
  for (const role of roles) {
    ui.info(`${role.emoji ?? ''} ${role.name} (${role.id})`);
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'appId',
        message: `  App ID:`,
        validate: (v: string) => (v && v.trim().length > 0) || '不能为空',
      },
      {
        type: 'password',
        name: 'appSecret',
        message: `  App Secret:`,
        validate: (v: string) => (v && v.trim().length > 0) || '不能为空',
      },
    ]);
    credentials[role.id] = {
      appId: (answers.appId as string).trim(),
      appSecret: (answers.appSecret as string).trim(),
    };
  }

  return { feishuGroupId, credentials };
}

async function createBitable(
  appId: string,
  appSecret: string,
  roles: AgentRole[],
): Promise<{ appToken: string; tableId: string; bitableUrl: string }> {
  const dummyConfig = { url: '', appToken: '', tableId: '' };
  const client = new BitableClient(appId, appSecret, dummyConfig);

  // createBitable 返回飞书自动生成的 default_table_id，无需额外创建表
  const { appToken, tableId, url: bitableUrl } = await client.createBitable('任务管理');

  if (!tableId) {
    throw new Error('创建多维表格成功但未获得 tableId，请检查飞书应用权限');
  }

  const agentNames = getAgentNames(roles);
  const fields = buildFieldSchemas(agentNames);

  ui.working(`初始化表格结构 (${fields.length} 个业务字段)`);
  await client.initializeTableSchema(appToken, tableId, fields);
  ui.done();

  ui.working('清空默认/示例记录');
  await client.clearAllRecords(appToken, tableId);
  ui.done();

  return { appToken, tableId, bitableUrl };
}

function installSkill(skillsDir: string): void {
  const targetDir = join(skillsDir, 'team-tasks');
  mkdirSync(targetDir, { recursive: true });
  cpSync(SKILLS_SRC_DIR + '/team-tasks', targetDir, { recursive: true, force: true });
}

function parseInterval(str: string): number {
  const match = str.match(/^(\d+)(m|h|s)$/);
  if (!match) return 600000;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  return 600000;
}

function printSummary(
  profile: string,
  config: AgentTeamConfig,
  bitableUrl: string,
  roles: AgentRole[],
): void {
  const profileDisplay = profile || '默认 (~/.openclaw/)';
  const teamPrefix = profile ? `openclaw-team --profile ${profile} ` : 'openclaw-team ';
  const openclawProfileFlag = profile ? `--profile ${profile} ` : '';

  ui.kvBox('初始化完成 ✅', [
    ['Profile', profileDisplay],
    ['任务表', bitableUrl],
    ['Agents', Object.keys(config.agents).join(', ')],
  ]);

  ui.tipBox('⚠ 请将以下机器人添加到飞书群组', [
    `群组 ID: ${config.feishuGroupId}`,
    '',
    ...roles.map((r) => `  ${r.emoji ?? ''} ${r.name} (${r.id})`),
    '',
    '请确保各应用已开通：接收/发送消息、多维表格权限',
  ]);

  ui.kvBox('下一步', [
    ['查看任务', `${teamPrefix}task list`],
    ['创建任务', `${teamPrefix}task create --title "..." --detail "..."`],
    ['查看 Cron', `openclaw ${openclawProfileFlag}cron list`],
  ]);

  ui.footer();
}
