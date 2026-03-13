# AGENTS.md - OpenClaw Team 开发指南

本文档为在此代码库中工作的 AI Agent 提供开发规范和运行指南。

---

## 1. 构建与运行命令

### 核心命令

```bash
# 安装依赖
pnpm install

# 编译 TypeScript（输出到 dist/）
pnpm run build

# 开发模式（使用 tsx 实时运行）
pnpm run dev

# 运行飞书多维表格集成测试
pnpm run test:bitable

# 直接运行 CLI
node ./dist/index.js --help
npx openclaw-team --help
```

### 测试单个文件

由于项目没有配置 Jest/Vitest，测试通过直接运行 TypeScript 文件完成：

```bash
# 运行特定测试文件
npx tsx test/test-bitable.ts

# 或编译后运行
node ./dist/index.js task list
```

### 类型检查

```bash
# 单独运行 TypeScript 类型检查
npx tsc --noEmit
```

---

## 2. 代码风格规范

### 2.1 模块系统

- **ESM 模块**：`package.json` 中设置 `"type": "module"`
- **导入扩展名**：必须使用 `.js` 扩展名（ESM 要求）
  ```typescript
  // ✅ 正确
  import { something } from './utils.js';
  
  // ❌ 错误
  import { something } from './utils';
  ```

### 2.2 类型导入

- **类型-only 导入**：使用 `import type` 减少运行时代码
  ```typescript
  // 仅导入类型
  import type { AgentTeamConfig } from './types.js';
  
  // 导入值和类型
  import { someFunction, type SomeType } from './module.js';
  ```

### 2.3 命名规范

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 文件 | kebab-case | `bitable-client.ts`, `task-operations.ts` |
| 接口/类型 | PascalCase | `AgentTeamConfig`, `TaskRecord` |
| 函数/变量 | camelCase | `parseBitableInput`, `appToken` |
| 常量 | UPPER_SNAKE_CASE | `BATCH_SIZE = 500` |
| 枚举成员 | PascalCase | `TaskStatus.已暂停` |

### 2.4 代码格式

- **缩进**：2 空格
- **分号**：使用分号
- **引号**：单引号优先
- **多行对象**：末尾逗号（trailing comma）

```typescript
// ✅ 正确格式
const config = {
  profile: 'pz',
  template: 'small-dev',
  credentials: {
    pm: { appId: 'cli_xxx', appSecret: 'secret' },
  },
};
```

### 2.5 注释规范

- **语言**：中文注释（与项目 README 保持一致）
- **函数注释**：使用 JSDoc 风格描述参数和返回值

```typescript
/**
 * 解析多维表格输入，支持 URL 或纯 Token
 * @param input - 用户输入的 URL 或 App Token
 * @returns 解析后的 { appToken, tableId, url }
 */
export function parseBitableInput(input: string): ParsedInput {
  // 实现逻辑
}
```

---

## 3. 错误处理

### 3.1 抛出错误

```typescript
// ✅ 使用 Error 类，携带清晰消息
throw new Error(`配置文件不存在: ${absPath}`);
throw new Error('团队配置不存在，请先运行 init');

// ❌ 避免裸字符串
throw 'something went wrong';
```

### 3.2 捕获错误

```typescript
try {
  await someOperation();
} catch (err: any) {
  console.error(chalk.red(`✗ 操作失败: ${err.message}`));
  process.exit(1);
}
```

### 3.3 空值处理

```typescript
// ✅ 使用可选链和空值合并
const name = config?.profile ?? 'default';
const token = options?.appToken;

// ✅ 显式检查
if (!config) {
  throw new Error('配置不能为空');
}
```

---

## 4. 目录结构

```
openclaw-team/
├── bin/                  # CLI 入口脚本
│   └── openclaw-team.js
├── src/
│   ├── index.ts          # 主入口，Command 注册
│   ├── config.ts         # 配置文件读写
│   ├── types.ts          # TypeScript 类型定义
│   ├── commands/         # CLI 命令实现
│   │   ├── init.ts       # 初始化命令
│   │   ├── task.ts       # 任务管理命令
│   │   └── uninstall.ts  # 卸载命令
│   ├── bitable/          # 飞书多维表格客户端
│   │   ├── client.ts
│   │   ├── operations.ts
│   │   └── schema.ts
│   └── team/             # 团队工作空间管理
│       ├── workspace.ts
│       ├── templates.ts
│       └── setup.ts
├── test/
│   └── test-bitable.ts  # 集成测试
├── templates/            # Agent 团队模板
├── skills/               # Skill 定义
└── dist/                # 编译输出
```

---

## 5. 常用模式

### 5.1 CLI 命令注册（Commander）

```typescript
export function registerTaskCommand(program: Command): void {
  program
    .command('task')
    .description('任务管理')
    .option('--format <json|csv|table>', '输出格式')
    .action(async (opts) => {
      // 实现逻辑
    });
}
```

### 5.2 交互式输入（Inquirer）

```typescript
const { confirmed } = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'confirmed',
    message: '确认执行？',
    default: true,
  },
]);
```

### 5.3 彩色输出（Chalk）

```typescript
console.log(chalk.bold.cyan('\n🦞 初始化完成\n'));
console.log(chalk.green('✓ 成功'));
console.log(chalk.red('✗ 失败'));
console.log(chalk.yellow('⚠ 警告'));
```

---

## 6. 依赖库使用

| 库 | 用途 | 引用方式 |
|----|------|----------|
| `commander` | CLI 参数解析 | `import { Command } from 'commander'` |
| `inquirer` | 交互式提问 | `import inquirer from 'inquirer'` |
| `chalk` | 彩色终端输出 | `import chalk from 'chalk'` |
| `@larksuiteoapi/node-sdk` | 飞书 API | `import * as lark from '@larksuiteoapi/node-sdk'` |

---

## 7. 注意事项

### 7.1 禁止事项

- **禁止**使用 `as any` 或 `@ts-ignore` 绕过类型检查
- **禁止**提交 `node_modules/` 或 `dist/` 目录
- **禁止**在代码中硬编码密钥（使用环境变量或配置文件）

### 7.2 提交前检查

```bash
# 类型检查
npx tsc --noEmit

# 编译确认成功
pnpm run build
```

### 7.3 开发建议

- 使用 `pnpm run dev` 进行实时开发
- 修改后记得重新 `pnpm run build`
- 测试文件直接用 `npx tsx` 运行，无需编译

---

## 8. 相关文档

- [README.md](./README.md) - 项目概述和使用说明
- [templates/](./templates/) - Agent 团队模板
- [skills/](./skills/) - Skill 定义
