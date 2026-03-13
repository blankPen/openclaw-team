import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerTaskCommand } from './commands/task.js';
import { registerUninstallCommand } from './commands/uninstall.js';

const program = new Command();

program
  .name('openclaw-team')
  .description('OpenClaw Agent 团队任务管理 CLI')
  .version('1.0.0')
  .option('--profile <name>', 'OpenClaw profile 名称（不指定则使用默认 ~/.openclaw/）');

registerInitCommand(program);
registerTaskCommand(program);
registerUninstallCommand(program);

program.parse(process.argv);
