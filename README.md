# OpenClaw Team

基于 OpenClaw 的 Agent 团队任务管理 CLI：多维表格 + 多角色 Agent + 飞书群 + Cron 定时检查。

---

## 前置条件

- **Node.js** 18+
- **pnpm**（或 npm）
- **OpenClaw CLI** 已安装且可用（`openclaw --version` 能执行）
- 飞书：至少一个**群组**，以及若干**自建应用**（每个 Agent 角色对应一个应用，用于机器人）

---

## 安装（给 AI：按顺序执行即可）

在项目根目录执行：

```bash
pnpm install
pnpm run build
```

如需全局使用（可选）：

```bash
npm link
# 之后可直接运行 openclaw-team
```

或直接通过 npx 运行（无需 link）：

```bash
npx openclaw-team --help
node ./dist/index.js init   # 或 npx tsx src/index.ts init
```

---

## 初始化：交互式流程说明

运行：

```bash
openclaw-team init
# 或指定 profile：openclaw-team --profile pz init
```

### 会出现的步骤与输入（按顺序）

| 步骤 | 提示内容 | 建议输入 / 说明 |
|------|-----------|-----------------|
| (可选) | 选择 profile | 无 `--profile` 时会问用哪个 OpenClaw 配置目录；可选「默认」或输入如 `pz` |
| (若已有配置) | 是否覆盖现有配置 | 选 `Y` 或 `N` |
| **第 1 步** | 选择团队模板 | `small-dev` / `standard-dev` / `content-ops` 三选一（或用 `--template <id>` 跳过） |
| **第 2 步** | 飞书群组 ID | 所有机器人共用的一个飞书群 ID（必填） |
| **第 2 步** | 每个角色的 App ID / App Secret | 按角色依次输入：每个角色对应**一个**飞书应用，需该应用的 App ID 和 App Secret |
| **第 3 步** | 多维表格来源 | 选「创建新的」或「使用已有的」；若选已有，再输入多维表格 URL 或 App Token |
| (后续) | 创建 workspace、同步 openclaw.json、安装 Skill、创建 Cron | 无需输入，等待完成即可 |

### 团队模板与角色 ID（用于 .env 和命令行）

| 模板 id | 说明 | 角色 id（每个角色一个飞书应用） |
|---------|------|--------------------------------|
| `small-dev` | 小型研发 | `pm`, `dev`, `qa` |
| `standard-dev` | 标准研发 | `pm`, `product`, `fe`, `be`, `qa`, `ops` |
| `content-ops` | 内容运营 | `pm`, `product`, `copy`, `operation` |

---

## 使用配置文件一键初始化（推荐给 AI：零交互）

使用 `--config <path>` 可从 JSON 文件读取完整配置，**跳过所有交互**，适合 AI 或脚本调用。

### 配置文件格式

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `profile` | string | 否 | OpenClaw profile，省略则用默认 `~/.openclaw/` |
| `template` | string | 是 | 团队模板：`small-dev` / `standard-dev` / `content-ops` |
| `feishuGroupId` | string | 是 | 飞书群组 ID，所有机器人共用 |
| `credentials` | object | 是 | 每个角色一个飞书应用：`roleId` → `{ "appId", "appSecret", "name"? }`；可选 `name` 为该角色显示名称（未填则用模板默认名） |
| `bitable` | string \| null | 否 | 不填或 `null`：创建新多维表格；字符串：已有多维表格 URL 或 App Token |
| `interval` | string | 否 | Cron 间隔，默认 `10m` |
| `force` | boolean | 否 | 已有团队配置时是否覆盖，默认 `false` |

### 示例（small-dev 三角色）

见项目根目录 `init-config.example.json`，或如下：

```json
{
  "profile": "pz",
  "template": "small-dev",
  "feishuGroupId": "oc_xxxxxxxxxxxxxxxxxxxxxxxx",
  "credentials": {
    "pm": { "appId": "cli_xxx_pm", "appSecret": "your_secret_pm", "name": "PM" },
    "dev": { "appId": "cli_xxx_dev", "appSecret": "your_secret_dev", "name": "开发" },
    "qa": { "appId": "cli_xxx_qa", "appSecret": "your_secret_qa", "name": "测试" }
  },
  "bitable": null,
  "interval": "10m",
  "force": false
}
```

### 执行

```bash
openclaw-team init --config init-config.example.json
# 若已有配置且要覆盖，加上 --force 或配置里 "force": true
```

- 配置文件路径可为相对路径（相对当前工作目录）或绝对路径。
- 使用 `--config` 时不再询问 profile、模板、飞书凭证、多维表格来源；若 `bitable` 未填则自动创建新表。
- 校验：`credentials` 必须包含当前模板下**所有角色**的 `appId` 与 `appSecret`，否则报错并退出。

---

## 初始化可选参数（可交给 AI 自动带参）

```bash
openclaw-team init [选项]
```

| 选项 | 说明 |
|------|------|
| `--profile <name>` | 指定 OpenClaw profile（如 `pz`），不指定则交互选 |
| `--template <id>` | 直接指定模板：`small-dev` / `standard-dev` / `content-ops`，不指定则交互选 |
| `--bitable <url或token>` | 使用已有多维表格（URL 或 App Token），不指定则交互选新建/已有 |
| `--interval <duration>` | Cron 间隔，默认 `10m`（如 `5m`、`1h`） |
| `--force` | 已有配置时直接覆盖，不二次确认 |
| `--dry-run` | 只打印将要做的配置，不实际执行 |

示例：

```bash
# 交互式：指定模板与 profile
openclaw-team init --template standard-dev
openclaw-team --profile pz init --template small-dev --bitable "https://xxx.feishu.cn/base/xxx"

# 零交互：使用配置文件（推荐）
openclaw-team init --config init-config.json
```

---

## 初始化完成后必做：把机器人加进群

init 结束时会提示：**请将以下机器人添加到飞书群组**，并列出群组 ID 与各角色名。

请务必：

1. 打开对应飞书群，将**每个角色对应的应用**添加为群成员（机器人）。
2. 确保各应用具备所需权限：接收消息、发送消息、多维表格（创建/编辑/查看，按你使用的功能）等。

否则 Cron 推送与任务协作会失败。

---

## 常用命令

```bash
# 查看任务列表
openclaw-team task list
openclaw-team --profile pz task list --format json

# 创建任务
openclaw-team task create --title "任务标题" --detail "详情" --assignee "执行人角色名"

# 查看 Cron
openclaw cron list
openclaw --profile pz cron list
```

---

## 卸载

```bash
openclaw-team uninstall
# 或 openclaw-team --profile pz uninstall
```

会交互选择删除范围：**全部（配置 + 团队工作空间）** / **仅配置** / **仅工作空间**。仅工作空间时，会再交互勾选要删除的 `workspace-*` 目录（只删与当前团队配置对应的，不会动用户自建目录）。

---

## 给 AI 的快速检查清单

若你正在帮用户自动安装并完成首次初始化，推荐**使用配置文件**，零交互：

1. **安装**：在项目根执行 `pnpm install && pnpm run build`。
2. **配置文件**：根据用户提供的飞书群 ID、各角色应用 App ID/Secret，生成一份 JSON（参考 `init-config.example.json`），包含 `template`、`feishuGroupId`、`credentials`（每个角色 `appId`/`appSecret`），以及可选 `profile`、`bitable`、`interval`、`force`。
3. **执行**：`openclaw-team init --config <path>`；若需覆盖已有配置则加 `--force` 或在 JSON 中 `"force": true`。
4. **提醒用户**：init 完成后，把各角色机器人添加到配置中的飞书群，并检查应用权限。
5. **验证**：`openclaw-team task list` 或 `openclaw cron list`。

若不用配置文件，则需交互式输入 profile、模板、飞书群组与各角色应用凭证、多维表格来源。
