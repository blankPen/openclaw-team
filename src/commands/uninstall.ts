import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { unlinkSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadConfig, getConfigPath, getProfileDir, profileFlag } from '../config.js';
import { removeFromOpenclawConfig } from '../team/openclaw-json.js';
import * as ui from '../ui.js';

type UninstallScope = 'all' | 'config' | 'workspace';

/**
 * 解析 profile：与 task 一致，未指定则用默认 ''。
 */
function resolveProfile(flagValue: string | undefined): string {
  if (flagValue === undefined) return '';
  return flagValue === 'default' ? '' : flagValue;
}

/** 仅删除与 team 配置相关的 workspace-<agentId> 目录，不删用户自建的其他 workspace-* */
function removeTeamWorkspaceDirs(profile: string, agentIds: string[]): string[] {
  const root = getProfileDir(profile);
  if (!existsSync(root) || agentIds.length === 0) return [];
  const removed: string[] = [];
  const allowed = new Set(agentIds.map((id) => `workspace-${id}`));
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (name.isDirectory() && allowed.has(name.name)) {
      rmSync(join(root, name.name), { recursive: true });
      removed.push(name.name);
    }
  }
  return removed;
}

export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('卸载团队：可仅删配置、仅删工作空间、或全部删除（默认）')
    .option('--profile <name>', 'OpenClaw profile 名称（不指定则使用默认 ~/.openclaw/）')
    .option('--scope <scope>', '删除范围：all / config / workspace（不指定则交互选择）')
    .option('--force', '不确认直接执行', false)
    .action(async (opts, cmd) => {
      const merged = cmd.optsWithGlobals() as { profile?: string; scope?: string; force?: boolean };
      const profile = resolveProfile(merged.profile);
      const configPath = getConfigPath(profile);

      let scope: UninstallScope;
      const scopeFlag = (merged.scope ?? opts.scope ?? '').trim().toLowerCase();
      if (scopeFlag === 'config' || scopeFlag === 'workspace') {
        scope = scopeFlag;
      } else if (scopeFlag === 'all') {
        scope = 'all';
      } else {
        const { scopeChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'scopeChoice',
            message: '选择删除范围:',
            default: 'all',
            choices: [
              { name: '全部（配置 + 工作空间）', value: 'all' },
              { name: '仅配置（team-config、Cron、Agent、openclaw.json）', value: 'config' },
              { name: '仅工作空间（workspace-* 目录）', value: 'workspace' },
            ],
          },
        ]);
        scope = scopeChoice as UninstallScope;
      }

      if (scope === 'workspace') {
        if (!existsSync(configPath)) {
          ui.warn('仅删除工作空间需依赖团队配置以识别目录，未找到 team-config.json');
          return;
        }
        const config = loadConfig(profile)!;
        const agentIds = Object.keys(config.agents ?? {});
        if (agentIds.length === 0) {
          ui.warn('配置中无 Agent 记录，无法识别要删除的工作空间');
          return;
        }
        const root = getProfileDir(profile);
        const choices = agentIds
          .filter((id) => existsSync(join(root, `workspace-${id}`)))
          .map((id) => ({
            name: `workspace-${id} (${config.agents![id]?.role ?? id})`,
            value: id,
          }));
        if (choices.length === 0) {
          ui.warn('未找到团队工作空间目录');
          return;
        }
        const { selectedIds } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedIds',
            message: '选择要删除的工作空间（空格勾选/取消，回车确认）:',
            choices,
          },
        ]);
        const toRemove = (selectedIds as string[]) ?? [];
        if (toRemove.length === 0) {
          ui.dim('未选择任何工作空间，已取消');
          return;
        }
        if (!opts.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `将删除 ${toRemove.length} 个工作空间（${toRemove.map((id) => `workspace-${id}`).join(', ')}），是否继续？`,
              default: false,
            },
          ]);
          if (!confirm) {
            ui.dim('已取消');
            return;
          }
        }
        const removed = removeTeamWorkspaceDirs(profile, toRemove);
        removed.forEach((d) => ui.dim(`已删除 ${d}`));
        ui.success(`已删除 ${removed.length} 个团队工作空间`);
        return;
      }

      if (!existsSync(configPath)) {
        ui.warn('未找到团队配置，无需卸载');
        return;
      }

      const config = loadConfig(profile)!;
      const agentIds = Object.keys(config.agents ?? {});

      if (agentIds.length === 0) {
        ui.dim('配置中无 Agent 记录');
        unlinkSync(configPath);
        ui.success('已删除 team-config.json');
        return;
      }

      const scopeLabel =
        scope === 'all'
          ? '配置 + 工作空间（team-config、Cron、Agent、openclaw.json、workspace-*）'
          : '仅配置（team-config、Cron、Agent、openclaw.json 中的条目）';

      if (!opts.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `将删除：${scopeLabel}。共 ${agentIds.length} 个 Agent，是否继续？`,
            default: false,
          },
        ]);
        if (!confirm) {
          ui.dim('已取消');
          return;
        }
      }

      ui.section('正在卸载');

      const flag = profileFlag(profile);

      for (const agentId of agentIds) {
        const entry = config.agents![agentId];
        if (entry?.cronJobId) {
          try {
            execSync(
              `openclaw ${flag} cron rm "${entry.cronJobId}" --json`.trim(),
              { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
            );
            ui.dim(`已移除 cron: ${agentId}`);
          } catch {
            // ignore
          }
        }
        try {
          execSync(
            `openclaw ${flag} agents delete "${agentId}" --force --json`.trim(),
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
          );
          ui.dim(`已删除 agent: ${agentId}`);
        } catch {
          // agent 可能已被手动删除
        }
      }

      removeFromOpenclawConfig(profile, agentIds);
      ui.dim('已从 openclaw.json 移除上述 Agent');

      unlinkSync(configPath);
      ui.success('已删除 team-config.json');

      if (scope === 'all') {
        const removed = removeTeamWorkspaceDirs(profile, agentIds);
        removed.forEach((d) => ui.dim(`已删除 ${d}`));
        if (removed.length > 0) ui.success(`已删除 ${removed.length} 个团队工作空间`);
      }

      ui.success('卸载完成');
      ui.footer();
    });
}
