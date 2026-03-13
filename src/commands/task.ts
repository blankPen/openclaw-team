import { Command } from 'commander';
import chalk from 'chalk';
import { requireConfig, getMemberNames } from '../config.js';
import { BitableClient } from '../bitable/client.js';
import { TaskOperations } from '../bitable/operations.js';
import * as ui from '../ui.js';
import type {
  AgentTeamConfig,
  TaskListOptions,
  TaskPriority,
  TaskStatus,
  TaskStage,
  TaskType,
} from '../types.js';

/**
 * 解析 profile：仅按 --profile 决定，不做自动探测。
 * - 指定了 --profile <name>：严格使用该 profile（~/.openclaw-<name>/team-config.json）。
 * - 未指定 --profile：使用默认 profile ''（~/.openclaw/team-config.json）。
 * "default" 规范化为 ''。
 */
function resolveProfile(flagValue: string | undefined): string {
  if (flagValue === undefined) {
    return '';
  }
  return flagValue === 'default' ? '' : flagValue;
}

function buildBitableClient(flagProfile: string | undefined, config?: AgentTeamConfig) {
  const profile = resolveProfile(flagProfile);
  const c = config ?? requireConfig(profile);
  const client = new BitableClient(c.feishuAppId, c.feishuAppSecret, c.bitable);
  return new TaskOperations(client);
}

/** 校验负责人必须在配置的成员名称中；否则抛出包含当前成员列表的 Error。 */
function validateAssignee(assignee: string, memberNames: string[], label: string): void {
  const trimmed = assignee.trim();
  if (!trimmed) return;
  if (memberNames.length === 0) {
    throw new Error('无法校验负责人：当前配置中无成员列表，请先运行 openclaw-team init');
  }
  if (!memberNames.includes(trimmed)) {
    throw new Error(
      `${label}必须是配置的成员名称。当前配置的成员有：${memberNames.join('、')}；收到：${trimmed}`
    );
  }
}

function formatTable(records: any[]): void {
  if (records.length === 0) {
    ui.warn('暂无任务');
    return;
  }

  const headers = ['ID', '任务描述', '类型', '执行人', '状态', '优先级', '阶段', '项目'];
  const rows = records.map((r) => [
    r.recordId.slice(0, 12),
    truncate(r.title, 24),
    r.taskType ?? '-',
    r.assignee ?? '-',
    r.status,
    r.priority,
    r.stage ?? '-',
    r.project ?? '-',
  ]);

  ui.table(headers, rows);
}

function truncate(str: string | undefined, len: number): string {
  if (!str) return '-';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

export function registerTaskCommand(program: Command): void {
  const task = program
    .command('task')
    .description('任务管理操作 (list/create/update/complete/flow)');

  // ── list ──────────────────────────────────────────────────────────
  task
    .command('list')
    .description('查看任务列表')
    .option('--assignee <name>', '按执行人过滤')
    .option('--status <status>', '按进展过滤 (待开始/进行中/已完成/已暂停)')
    .option('--project <project>', '按项目过滤')
    .option('--type <type>', '按任务类型过滤 (需求/缺陷/优化/文档/其他)')
    .option('--priority <priority>', '按优先级过滤 (P0/P1/P2/P3)')
    .option('--stage <stage>', '按阶段过滤')
    .option('--format <format>', '输出格式 (json/csv/table)', 'table')
    .action(async (opts, cmd) => {
      try {
        const { profile } = cmd.optsWithGlobals() as { profile?: string };
        const ops = buildBitableClient(profile);
        const options: TaskListOptions = {
          assignee: opts.assignee,
          status: opts.status as TaskStatus | undefined,
          project: opts.project,
          taskType: opts.type as TaskType | undefined,
          priority: opts.priority as TaskPriority | undefined,
          stage: opts.stage as TaskStage | undefined,
        };
        const records = await ops.list(options);

        if (opts.format === 'json') {
          console.log(JSON.stringify(records, null, 2));
        } else if (opts.format === 'csv') {
          console.log('recordId,title,taskType,assignee,status,priority,stage,project');
          records.forEach((r) => {
            console.log(
              [r.recordId, r.title, r.taskType ?? '', r.assignee ?? '', r.status, r.priority, r.stage ?? '', r.project ?? '']
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(',')
            );
          });
        } else {
          formatTable(records);
        }
      } catch (err: any) {
        ui.error(err.message);
        process.exit(1);
      }
    });

  // ── create ────────────────────────────────────────────────────────
  task
    .command('create')
    .description('创建新任务（主 Agent 使用）')
    .requiredOption('--title <text>', '任务描述（简要概述）')
    .requiredOption('--detail <text>', '任务详情（执行要求、验收标准）')
    .requiredOption('--project <project>', '项目名称')
    .requiredOption('--assignee <name>', '执行人（Agent 角色名，须为配置的成员名称）')
    .option('--type <type>', '任务类型 (需求/缺陷/优化/文档/其他)', '需求')
    .option('--priority <priority>', '优先级 P0/P1/P2/P3', 'P2')
    .option('--stage <stage>', '任务阶段', '需求分析')
    .action(async (opts, cmd) => {
      try {
        const { profile } = cmd.optsWithGlobals() as { profile?: string };
        const p = resolveProfile(profile);
        const config = requireConfig(p);
        const memberNames = getMemberNames(config);
        validateAssignee(opts.assignee, memberNames, '任务负责人');
        const ops = buildBitableClient(profile, config);
        const recordId = await ops.create({
          title: opts.title,
          detail: opts.detail,
          project: opts.project,
          taskType: (opts.type ?? '需求') as TaskType,
          priority: (opts.priority ?? 'P2') as TaskPriority,
          assignee: opts.assignee,
          stage: (opts.stage ?? '需求分析') as TaskStage,
        });
        ui.success('任务创建成功');
        ui.dim(`record_id: ${chalk.cyan(recordId)}`);
      } catch (err: any) {
        ui.error(err.message);
        process.exit(1);
      }
    });

  // ── update ────────────────────────────────────────────────────────
  task
    .command('update <record_id>')
    .description('更新任务进展；状态变为「已完成」时须同时传 --summary')
    .option('--status <status>', '变更状态 (待开始/进行中/已暂停/已完成)')
    .option('--progress <text>', '更新最新进展记录')
    .option('--assignee <name>', '变更执行人（须为配置的成员名称）')
    .option('--priority <priority>', '变更优先级')
    .option('--summary <text>', '任务情况总结（状态变为完成时必填）')
    .action(async (recordId: string, opts, cmd) => {
      try {
        const { profile } = cmd.optsWithGlobals() as { profile?: string };
        const p = resolveProfile(profile);
        const config = requireConfig(p);
        if (opts.assignee != null) {
          const memberNames = getMemberNames(config);
          validateAssignee(opts.assignee, memberNames, '任务负责人');
        }
        const ops = buildBitableClient(profile, config);
        await ops.update(recordId, {
          status: opts.status as TaskStatus | undefined,
          progress: opts.progress,
          assignee: opts.assignee,
          priority: opts.priority as TaskPriority | undefined,
          summary: opts.summary,
        });
        ui.success(`任务已更新 ${chalk.dim(`[${recordId}]`)}`);
      } catch (err: any) {
        ui.error(err.message);
        process.exit(1);
      }
    });

  // ── complete ──────────────────────────────────────────────────────
  task
    .command('complete <record_id>')
    .description('完成任务并提交总结')
    .requiredOption('--summary <text>', '任务情况总结（产出内容 + 变更描述 + 关键链接）')
    .action(async (recordId: string, opts, cmd) => {
      try {
        const { profile } = cmd.optsWithGlobals() as { profile?: string };
        const ops = buildBitableClient(profile);
        await ops.complete(recordId, { summary: opts.summary });
        ui.success(`任务已完成 ${chalk.dim(`[${recordId}]`)}`);
      } catch (err: any) {
        ui.error(err.message);
        process.exit(1);
      }
    });

  // ── flow ──────────────────────────────────────────────────────────
  task
    .command('flow <record_id>')
    .description('流转任务到下一阶段（主 Agent 使用）')
    .requiredOption('--next-assignee <name>', '下一阶段执行人（须为配置的成员名称）')
    .option('--stage <stage>', '目标阶段（不填则按流水线自动推进）')
    .option('--note <text>', '给下一执行人的补充说明')
    .action(async (recordId: string, opts, cmd) => {
      try {
        const { profile } = cmd.optsWithGlobals() as { profile?: string };
        const p = resolveProfile(profile);
        const config = requireConfig(p);
        const memberNames = getMemberNames(config);
        validateAssignee(opts.nextAssignee, memberNames, '下一阶段执行人');
        const ops = buildBitableClient(profile, config);
        await ops.flow(recordId, {
          nextAssignee: opts.nextAssignee,
          stage: opts.stage as TaskStage | undefined,
          note: opts.note,
        });
        ui.success(`任务已流转至 ${chalk.bold(opts.nextAssignee)} ${chalk.dim(`[${recordId}]`)}`);
      } catch (err: any) {
        ui.error(err.message);
        process.exit(1);
      }
    });
}
