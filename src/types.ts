export interface AgentRole {
  id: string;
  name: string;
  isMain: boolean;
  cronInterval: number;
  emoji?: string;
}

export interface BitableConfig {
  url: string;
  appToken: string;
  tableId: string;
}

export interface AgentTeamConfig {
  version: number;
  teamName: string;
  profile: string;
  mainAgent: string;
  bitable: BitableConfig;
  feishuGroupId: string;
  feishuAppId: string;
  feishuAppSecret: string;
  agents: Record<string, AgentEntry>;
  cronInterval: number;
  skillsDir: string;
}

export interface AgentEntry {
  role: string;
  agentId: string;
  cronJobId?: string;
}

export type TaskStatus = '已暂停' | '待开始' | '进行中' | '已完成';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStage = '需求分析' | '技术设计' | '开发' | '测试' | '验收' | '完成';
export type TaskType = '需求' | '缺陷' | '优化' | '文档' | '其他';

export interface TaskRecord {
  recordId: string;
  title: string;
  detail: string;
  project?: string;
  taskType?: TaskType;
  priority: TaskPriority;
  progress?: string;
  summary?: string;
  assignee?: string;
  status: TaskStatus;
  stage?: TaskStage;
  startTime?: number;
  completedTime?: number;
}

/** 创建任务时以下字段必填：任务描述、任务详情、项目名称、需求类型、任务优先级、任务执行人、任务阶段 */
export interface TaskCreateOptions {
  title: string;
  detail: string;
  project: string;
  taskType: TaskType;
  priority: TaskPriority;
  assignee: string;
  stage: TaskStage;
}

export interface TaskUpdateOptions {
  status?: TaskStatus;
  progress?: string;
  assignee?: string;
  priority?: TaskPriority;
  /** 当 status 变为「已完成」时必填 */
  summary?: string;
}

export interface TaskCompleteOptions {
  summary: string;
}

export interface TaskFlowOptions {
  nextAssignee: string;
  stage?: TaskStage;
  note?: string;
}

export interface TaskListOptions {
  assignee?: string;
  status?: TaskStatus;
  project?: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  stage?: TaskStage;
  format?: 'json' | 'csv' | 'table';
}
