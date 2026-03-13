export const FIELD_NAMES = {
  TITLE: '任务描述',
  DETAIL: '任务详情',
  PROJECT: '项目名称',
  TASK_TYPE: '任务类型',
  PRIORITY: '任务优先级',
  PROGRESS: '最新进展记录',
  SUMMARY: '任务情况总结',
  ASSIGNEE: '任务执行人',
  STATUS: '进展',
  STAGE: '任务阶段',
  START_TIME: '开始时间',
  COMPLETED_TIME: '完成时间',
} as const;

export const FIELD_PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
export const FIELD_STATUS_OPTIONS = ['已暂停', '待开始', '进行中', '已完成'];
export const FIELD_STAGE_OPTIONS = ['需求分析', '技术设计', '开发', '测试', '验收', '完成'];
/** 任务类型：需求、缺陷、优化、文档、其他 */
export const FIELD_TASK_TYPE_OPTIONS = ['需求', '缺陷', '优化', '文档', '其他'];

// 飞书多维表格字段类型常量
export const BITABLE_FIELD_TYPES = {
  TEXT: 1,
  NUMBER: 2,
  SINGLE_SELECT: 3,
  MULTI_SELECT: 4,
  DATE: 5,
  CHECKBOX: 7,
  AUTO_NUMBER: 1005,
} as const;

export function buildFieldSchemas(assigneeOptions: string[]) {
  return [
    { field_name: FIELD_NAMES.TITLE, type: BITABLE_FIELD_TYPES.TEXT },
    { field_name: FIELD_NAMES.DETAIL, type: BITABLE_FIELD_TYPES.TEXT },
    {
      field_name: FIELD_NAMES.PROJECT,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: { options: [] },
    },
    {
      field_name: FIELD_NAMES.TASK_TYPE,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: {
        options: FIELD_TASK_TYPE_OPTIONS.map((name) => ({ name })),
      },
    },
    {
      field_name: FIELD_NAMES.PRIORITY,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: {
        options: FIELD_PRIORITY_OPTIONS.map((name) => ({ name })),
      },
    },
    { field_name: FIELD_NAMES.PROGRESS, type: BITABLE_FIELD_TYPES.TEXT },
    { field_name: FIELD_NAMES.SUMMARY, type: BITABLE_FIELD_TYPES.TEXT },
    {
      field_name: FIELD_NAMES.ASSIGNEE,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: {
        options: assigneeOptions.map((name) => ({ name })),
      },
    },
    {
      field_name: FIELD_NAMES.STATUS,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: {
        options: FIELD_STATUS_OPTIONS.map((name) => ({ name })),
      },
    },
    {
      field_name: FIELD_NAMES.STAGE,
      type: BITABLE_FIELD_TYPES.SINGLE_SELECT,
      property: {
        options: FIELD_STAGE_OPTIONS.map((name) => ({ name })),
      },
    },
    { field_name: FIELD_NAMES.START_TIME, type: BITABLE_FIELD_TYPES.DATE },
    { field_name: FIELD_NAMES.COMPLETED_TIME, type: BITABLE_FIELD_TYPES.DATE },
  ];
}
