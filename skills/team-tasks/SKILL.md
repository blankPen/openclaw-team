---
name: team-tasks
description: |
  Agent 团队任务管理。通过 openclaw-team CLI 操作飞书多维表格中的任务。
  包含查询、创建、更新、完成、流转五种操作。
  适用于主 Agent（项目经理）和各工作 Agent 在定时任务中管理团队任务。
---

# 团队任务管理 (team-tasks)

通过 `openclaw-team task <action>` 命令操作飞书多维表格中的任务。

**所有命令必须通过 `--profile <name>` 显式指定 profile（放在子命令前：`openclaw-team --profile <name> task list`），不依赖自动探测。**
**profile 名称从 AGENTS.md 的可用命令示例中获取。**

---

## 1. 查询任务 (query)

**命令:** `openclaw-team task list [options]`

| 参数 | 说明 | 示例 |
|------|------|------|
| `--assignee` | 按执行人过滤 | `--assignee "前端研发"` |
| `--status` | 按进展过滤 | `--status "待开始"` |
| `--project` | 按项目过滤 | `--project "电商项目"` |
| `--type` | 按任务类型过滤 | `--type "缺陷"` |
| `--priority` | 按优先级过滤 (P0-P3) | `--priority P0` |
| `--stage` | 按阶段过滤 | `--stage "开发"` |
| `--format` | 输出格式 (json/csv/table) | `--format json` |

**使用示例:**

```bash
# 查询我的待办任务（推荐 Agent 使用 json 格式方便解析）
openclaw-team --profile <name> task list --assignee "前端研发" --status "待开始" --format json

# 查询进行中的任务
openclaw-team --profile <name> task list --assignee "前端研发" --status "进行中" --format json

# 全局概览（主 Agent 使用）
openclaw-team --profile <name> task list --format json

# 查询指定项目的所有任务
openclaw-team --profile <name> task list --project "电商项目" --format json
```

**返回字段说明:**

- `recordId` — 记录 ID（用于 update/complete/flow 操作）
- `title` — 任务描述
- `detail` — 任务详情（执行要求、验收标准）
- `project` — 项目名称
- `taskType` — 任务类型 (需求/缺陷/优化/文档/其他)
- `priority` — 优先级 (P0/P1/P2/P3)
- `progress` — 最新进展记录
- `summary` — 任务情况总结（前一阶段产出，本阶段执行前必读）
- `assignee` — 当前执行人
- `status` — 进展 (待开始/进行中/已完成/已暂停)
- `stage` — 任务阶段 (需求分析/技术设计/开发/测试/验收/完成)
- `startTime` — 开始时间（时间戳）
- `completedTime` — 完成时间（时间戳）

---

## 2. 创建任务 (create)

**命令:** `openclaw-team task create [options]`（主 Agent 使用）

| 参数 | 必填 | 说明 |
|------|------|------|
| `--title` | 是 | 任务描述（简要概述，建议 20 字内） |
| `--detail` | 是 | 任务详情（执行要求、验收标准，要足够详细） |
| `--project` | 是 | 项目名称 |
| `--assignee` | 是 | 执行人（Agent 角色名） |
| `--type` | 否 | 任务类型：需求/缺陷/优化/文档/其他（默认"需求"） |
| `--priority` | 否 | P0/P1/P2/P3（默认 P2） |
| `--stage` | 否 | 任务阶段（默认"需求分析"） |

**使用示例:**

```bash
# 创建一个开发任务
openclaw-team --profile <name> task create \
  --title "实现用户登录页" \
  --detail "使用 React + Ant Design 实现登录页面，包含：1. 邮箱/密码表单；2. 表单校验（格式+非空）；3. 登录失败提示；4. 记住密码功能。验收标准：正常登录、错误提示、响应式布局均通过测试。" \
  --project "电商项目" \
  --priority P1 \
  --assignee "前端研发" \
  --stage "开发"
```

创建时：开始时间自动填入当前时间，进展默认为「待开始」。若任务描述、任务详情、项目名称、需求类型、任务优先级、任务执行人、任务阶段任一未填写会报错。创建后返回 `record_id`，保存备用。

---

## 3. 更新任务 (update)

**命令:** `openclaw-team task update <record_id> [options]`

| 参数 | 说明 |
|------|------|
| `--status` | 变更状态 (待开始/进行中/已暂停/已完成)；变为「已完成」时须同时传 `--summary` |
| `--progress` | 更新最新进展记录 |
| `--assignee` | 变更执行人 |
| `--priority` | 变更优先级 |
| `--summary` | 任务情况总结（当 `--status 已完成` 时必填；会自动写入完成时间） |

**使用示例:**

```bash
# 领取任务（开始执行）
openclaw-team --profile <name> task update recXXX --status "进行中"

# 汇报进展
openclaw-team --profile <name> task update recXXX --progress "已完成接口对接，剩余联调和样式调整，预计明天完成"

# 暂停并说明原因
openclaw-team --profile <name> task update recXXX --status "已暂停" --progress "等待后端接口：/api/user/login 尚未提供"
```

`record_id` 从 `list` 命令的 JSON 返回中获取 `recordId` 字段。

**同一时间只应有一个任务处于"进行中"状态。**

---

## 4. 完成任务 (complete)

**命令:** `openclaw-team task complete <record_id> --summary <text>`

完成任务并提交总结，自动设置状态为"已完成"并填入完成时间。

**summary 必须包含以下内容（缺一不可）：**

1. **产出内容** — 做了什么，产出是什么
2. **变更描述** — 改动了哪些文件/模块
3. **关键链接** — PR 链接、文档地址、部署地址等
4. **注意事项** — 下一阶段需要关注的点（可选但推荐）

**使用示例:**

```bash
openclaw-team --profile <name> task complete recXXX \
  --summary "完成用户登录页开发。新增 LoginPage 组件（src/pages/Login.tsx），含表单校验和错误处理。PR: github.com/xxx/pull/123。注意：密码强度校验规则需与后端确认是否一致。"
```

**summary 是下一环节 Agent 执行任务的核心参考，请认真填写，不要敷衍。**

---

## 5. 流转任务 (flow)

**命令:** `openclaw-team task flow <record_id> [options]`（主 Agent 使用）

| 参数 | 必填 | 说明 |
|------|------|------|
| `--next-assignee` | 是 | 下一阶段执行人（Agent 角色名） |
| `--stage` | 否 | 目标阶段（不填则沿流水线自动推进） |
| `--note` | 否 | 给下一执行人的补充说明 |

**流水线顺序:**

```
需求分析(产品) → 技术设计(可跳过) → 开发(前端/后端) → 测试(测试) → 验收(项目经理) → 完成
```

**使用示例:**

```bash
# 需求分析完成，流转到开发（跳过技术设计）
openclaw-team --profile <name> task flow recXXX --next-assignee "前端研发" --stage "开发"

# 开发完成，流转到测试
openclaw-team --profile <name> task flow recXXX --next-assignee "测试" --stage "测试"

# 测试不通过，打回开发
openclaw-team --profile <name> task flow recXXX --next-assignee "前端研发" --stage "开发" --note "存在 XSS 漏洞，详见测试报告"

# 验收通过，标记完成
openclaw-team --profile <name> task flow recXXX --next-assignee "项目经理" --stage "完成"
```

流转自动：重置状态为"待开始"、更新执行人和阶段、保留前一阶段总结供参考。

---

## 快速参考

| 角色 | 常用操作 |
|------|----------|
| 项目经理 | list（全局）、create、flow |
| 产品 | list（自己）、update、complete |
| 前端研发 | list（自己）、update、complete |
| 后端研发 | list（自己）、update、complete |
| 测试 | list（自己）、update、complete |
