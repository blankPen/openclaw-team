/**
 * 飞书多维表格集成测试
 * 用于验证 bitable 创建、字段配置、任务 CRUD 流程
 *
 * 运行: npx tsx test/test-bitable.ts
 */
import * as lark from '@larksuiteoapi/node-sdk';
import { BitableClient } from '../src/bitable/client.js';
import { TaskOperations } from '../src/bitable/operations.js';
import { buildFieldSchemas } from '../src/bitable/schema.js';
import { getAgentNames } from '../src/team/templates.js';

const APP_ID = process.env['FEISHU_APP_ID'] ?? 'cli_a923b70a57f89bd3';
const APP_SECRET = process.env['FEISHU_APP_SECRET'] ?? 'MuJEhUx6ysytciOn6Uf0Zc8yWNpDg4Lm';

function log(label: string, value?: unknown) {
  const prefix = `\x1b[36m[${label}]\x1b[0m`;
  if (value !== undefined) {
    console.log(prefix, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
  } else {
    console.log(prefix);
  }
}

function ok(msg: string) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg: string, err: unknown) {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  console.error(err);
  process.exit(1);
}

async function run() {
  console.log('\n=== 飞书多维表格集成测试 ===\n');

  // ── Step 1: 创建多维表格 ──────────────────────────────────────────
  log('Step 1', '创建多维表格 app...');
  const dummyConfig = { url: '', appToken: '', tableId: '' };
  const client = new BitableClient(APP_ID, APP_SECRET, dummyConfig);

  let appToken: string, tableId: string, bitableUrl: string;
  try {
    ({ appToken, tableId, url: bitableUrl } = await client.createBitable('测试任务管理'));
    ok(`创建成功 appToken=${appToken} tableId=${tableId}`);
    log('URL', bitableUrl);
  } catch (err) {
    fail('创建多维表格失败', err);
    return;
  }

  // ── Step 2: 创建字段 ──────────────────────────────────────────────
  log('Step 2', '创建任务管理字段...');
  const agentNames = getAgentNames();
  const fields = buildFieldSchemas(agentNames);
  log('字段数量', fields.length);
  log('字段列表', fields.map(f => f.field_name));

  try {
    await client.batchCreateFields(appToken, tableId, fields);
    ok('全部字段创建成功');
  } catch (err) {
    fail('创建字段失败', err);
    return;
  }

  // ── Step 3: 创建任务 ──────────────────────────────────────────────
  log('Step 3', '创建测试任务...');
  const bitableConfig = { url: bitableUrl, appToken, tableId };
  const taskClient = new BitableClient(APP_ID, APP_SECRET, bitableConfig);
  const ops = new TaskOperations(taskClient);

  let recordId: string;
  try {
    recordId = await ops.create({
      title: '测试任务',
      detail: '这是一个测试任务，用于验证任务创建功能',
      project: '测试项目',
      priority: 'P1',
      assignee: '前端研发',
      stage: '开发',
    });
    ok(`任务创建成功 recordId=${recordId}`);
  } catch (err) {
    fail('创建任务失败', err);
    return;
  }

  // ── Step 4: 查询任务 ──────────────────────────────────────────────
  log('Step 4', '查询任务列表...');
  try {
    const records = await ops.list({ assignee: '前端研发' });
    ok(`查询成功，共 ${records.length} 条`);
    if (records.length > 0) {
      log('第一条', { recordId: records[0]!.recordId, title: records[0]!.title, status: records[0]!.status });
    }
  } catch (err) {
    fail('查询任务失败', err);
    return;
  }

  // ── Step 5: 更新任务 ──────────────────────────────────────────────
  log('Step 5', '更新任务进展...');
  try {
    await ops.update(recordId, {
      status: '进行中',
      progress: '已完成 50%，正在实现核心功能',
    });
    ok('任务更新成功');
  } catch (err) {
    fail('更新任务失败', err);
    return;
  }

  // ── Step 6: 完成任务 ──────────────────────────────────────────────
  log('Step 6', '完成任务...');
  try {
    await ops.complete(recordId, {
      summary: '测试任务完成。新增测试组件，PR: github.com/test/pull/1。注意：测试覆盖率已达 90%。',
    });
    ok('任务完成成功');
  } catch (err) {
    fail('完成任务失败', err);
    return;
  }

  // ── Step 7: 流转任务 ──────────────────────────────────────────────
  log('Step 7', '流转任务到测试阶段...');
  try {
    await ops.flow(recordId, {
      nextAssignee: '测试',
      stage: '测试',
      note: '请重点测试登录流程',
    });
    ok('任务流转成功');
  } catch (err) {
    fail('流转任务失败', err);
    return;
  }

  // ── 最终查询验证 ──────────────────────────────────────────────────
  log('验证', '最终状态查询...');
  try {
    const all = await ops.list();
    const target = all.find(r => r.recordId === recordId);
    log('任务最终状态', target);
    ok('测试全部通过！');
  } catch (err) {
    fail('最终查询失败', err);
  }

  console.log('\n=== 测试完成 ===');
  console.log(`多维表格 URL: ${bitableUrl}`);
}

run().catch(err => {
  console.error('\n未捕获错误:', err);
  process.exit(1);
});
