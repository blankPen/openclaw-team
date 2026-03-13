import { BitableClient } from './client.js';
import { FIELD_NAMES } from './schema.js';
import type {
  TaskRecord,
  TaskCreateOptions,
  TaskUpdateOptions,
  TaskCompleteOptions,
  TaskFlowOptions,
  TaskListOptions,
  TaskStatus,
  TaskPriority,
  TaskStage,
  TaskType,
} from '../types.js';

function parseRecord(raw: any): TaskRecord {
  const f = raw.fields ?? {};
  return {
    recordId: raw.record_id ?? '',
    title: extractText(f[FIELD_NAMES.TITLE]) ?? '',
    detail: extractText(f[FIELD_NAMES.DETAIL]) ?? '',
    project: extractText(f[FIELD_NAMES.PROJECT]),
    taskType: extractText(f[FIELD_NAMES.TASK_TYPE]) as TaskType | undefined,
    priority: (extractText(f[FIELD_NAMES.PRIORITY]) ?? 'P2') as TaskPriority,
    progress: extractText(f[FIELD_NAMES.PROGRESS]),
    summary: extractText(f[FIELD_NAMES.SUMMARY]),
    assignee: extractText(f[FIELD_NAMES.ASSIGNEE]),
    status: (extractText(f[FIELD_NAMES.STATUS]) ?? '待开始') as TaskStatus,
    stage: extractText(f[FIELD_NAMES.STAGE]) as TaskStage | undefined,
    startTime: f[FIELD_NAMES.START_TIME] as number | undefined,
    completedTime: f[FIELD_NAMES.COMPLETED_TIME] as number | undefined,
  };
}

/**
 * 飞书多维表格字段值统一用纯字符串。
 * 部分字段（单选、多行文本）返回时可能是字符串或对象，统一提取文本。
 */
function trimmed(s: string | undefined): string {
  return (s ?? '').trim();
}

function extractText(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val || undefined;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    // 富文本数组格式（读取时可能遇到）
    return val
      .map((item) =>
        typeof item === 'object' && item !== null
          ? (item as any).text ?? ''
          : String(item)
      )
      .join('') || undefined;
  }
  if (typeof val === 'object') {
    // 单选对象格式
    return (val as any).text ?? (val as any).name ?? undefined;
  }
  return undefined;
}

export class TaskOperations {
  constructor(private client: BitableClient) {}

  async list(options: TaskListOptions = {}): Promise<TaskRecord[]> {
    const filterParts: string[] = [];

    if (options.assignee) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.ASSIGNEE}]="${options.assignee}"`);
    }
    if (options.status) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.STATUS}]="${options.status}"`);
    }
    if (options.project) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.PROJECT}]="${options.project}"`);
    }
    if (options.priority) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.PRIORITY}]="${options.priority}"`);
    }
    if (options.stage) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.STAGE}]="${options.stage}"`);
    }
    if (options.taskType) {
      filterParts.push(`CurrentValue.[${FIELD_NAMES.TASK_TYPE}]="${options.taskType}"`);
    }

    const filter = filterParts.length > 0 ? `AND(${filterParts.join(',')})` : undefined;
    const raw = await this.client.listRecords(filter);
    return raw.map(parseRecord);
  }

  /**
   * 创建任务。必填：任务描述、任务详情、项目名称、需求类型、任务优先级、任务执行人、任务阶段。
   * 自动生成开始时间（创建时间），进展默认为「待开始」。
   */
  async create(options: TaskCreateOptions): Promise<string> {
    const missing: string[] = [];
    if (!trimmed(options.title)) missing.push(FIELD_NAMES.TITLE);
    if (!trimmed(options.detail)) missing.push(FIELD_NAMES.DETAIL);
    if (!trimmed(options.project)) missing.push(FIELD_NAMES.PROJECT);
    if (!trimmed(options.taskType)) missing.push('需求类型');
    if (!trimmed(options.priority)) missing.push(FIELD_NAMES.PRIORITY);
    if (!trimmed(options.assignee)) missing.push(FIELD_NAMES.ASSIGNEE);
    if (!trimmed(options.stage)) missing.push(FIELD_NAMES.STAGE);
    if (missing.length > 0) {
      throw new Error(`创建任务时以下字段未填写：${missing.join('、')}`);
    }

    const fields: Record<string, unknown> = {
      [FIELD_NAMES.TITLE]: options.title.trim(),
      [FIELD_NAMES.DETAIL]: options.detail.trim(),
      [FIELD_NAMES.PROJECT]: options.project.trim(),
      [FIELD_NAMES.TASK_TYPE]: options.taskType.trim(),
      [FIELD_NAMES.PRIORITY]: options.priority.trim(),
      [FIELD_NAMES.ASSIGNEE]: options.assignee.trim(),
      [FIELD_NAMES.STAGE]: options.stage.trim(),
      [FIELD_NAMES.STATUS]: '待开始',
      [FIELD_NAMES.START_TIME]: Date.now(),
    };

    return this.client.createRecord(fields);
  }

  /**
   * 更新任务。当状态变为「已完成」时，必须填写任务情况总结，并自动写入完成时间。
   */
  async update(recordId: string, options: TaskUpdateOptions): Promise<void> {
    const fields: Record<string, unknown> = {};

    if (options.status) {
      fields[FIELD_NAMES.STATUS] = options.status;
      if (options.status === '已完成') {
        if (!trimmed(options.summary)) {
          throw new Error('状态变为完成时，必须填写任务情况总结（--summary）');
        }
        fields[FIELD_NAMES.SUMMARY] = options.summary!.trim();
        fields[FIELD_NAMES.COMPLETED_TIME] = Date.now();
      }
    }
    if (options.progress) fields[FIELD_NAMES.PROGRESS] = options.progress;
    if (options.assignee) fields[FIELD_NAMES.ASSIGNEE] = options.assignee;
    if (options.priority) fields[FIELD_NAMES.PRIORITY] = options.priority;

    await this.client.updateRecord(recordId, fields);
  }

  /**
   * 完成任务：状态设为已完成、写入任务情况总结、自动生成完成时间。
   * 任务情况总结必填。
   */
  async complete(recordId: string, options: TaskCompleteOptions): Promise<void> {
    if (!trimmed(options.summary)) {
      throw new Error('完成任务时，必须填写任务情况总结（--summary）');
    }
    await this.client.updateRecord(recordId, {
      [FIELD_NAMES.STATUS]: '已完成',
      [FIELD_NAMES.SUMMARY]: options.summary.trim(),
      [FIELD_NAMES.COMPLETED_TIME]: Date.now(),
    });
  }

  async flow(recordId: string, options: TaskFlowOptions): Promise<void> {
    const fields: Record<string, unknown> = {
      [FIELD_NAMES.STATUS]: '待开始',
      [FIELD_NAMES.ASSIGNEE]: options.nextAssignee,
    };

    if (options.stage) {
      fields[FIELD_NAMES.STAGE] = options.stage;
    }
    if (options.note) {
      fields[FIELD_NAMES.PROGRESS] = `[流转备注] ${options.note}`;
    }

    await this.client.updateRecord(recordId, fields);
  }
}
