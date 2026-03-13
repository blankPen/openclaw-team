import chalk from 'chalk';

const BRAND = chalk.hex('#FF6B35');
const BRAND_DIM = chalk.hex('#CC5529');
const ACCENT = chalk.hex('#4ECDC4');
const DIM = chalk.gray;
const SUCCESS = chalk.green;
const WARN = chalk.yellow;
const ERR = chalk.red;

/**
 * CLI 品牌 Banner
 */
export function banner(): void {
  console.log('');
  console.log(BRAND('  ╔═══════════════════════════════════════╗'));
  console.log(BRAND('  ║') + BRAND.bold('  🦞 OpenClaw Team                     ') + BRAND('║'));
  console.log(BRAND('  ║') + DIM('     Agent 团队任务管理 CLI             ') + BRAND('║'));
  console.log(BRAND('  ╚═══════════════════════════════════════╝'));
  console.log('');
}

/**
 * 段落标题
 */
export function section(title: string): void {
  console.log('');
  console.log(ACCENT.bold(`  ▸ ${title}`));
  console.log(DIM('  ' + '─'.repeat(40)));
}

/**
 * 带编号的步骤标题
 */
export function step(current: number, total: number, title: string): void {
  const label = DIM(`[${current}/${total}]`);
  console.log('');
  console.log(`  ${label} ${chalk.bold(title)}`);
}

/**
 * 成功日志
 */
export function success(msg: string): void {
  console.log(SUCCESS(`  ✓ ${msg}`));
}

/**
 * 警告日志
 */
export function warn(msg: string): void {
  console.log(WARN(`  ⚠ ${msg}`));
}

/**
 * 错误日志
 */
export function error(msg: string): void {
  console.log(ERR(`  ✗ ${msg}`));
}

/**
 * 信息日志
 */
export function info(msg: string): void {
  console.log(ACCENT(`  ℹ ${msg}`));
}

/**
 * 暗色辅助信息
 */
export function dim(msg: string): void {
  console.log(DIM(`    ${msg}`));
}

/**
 * 开始一个操作（带 ... 后缀）
 */
export function working(msg: string): void {
  process.stdout.write(DIM(`    ${msg}... `));
}

/**
 * 操作完成标记（跟在 working 后面）
 */
export function done(): void {
  console.log(SUCCESS('✓'));
}

/**
 * 操作跳过标记
 */
export function skipped(reason?: string): void {
  console.log(WARN(reason ? `跳过 (${reason})` : '跳过'));
}

/**
 * 使用 Unicode box-drawing 字符的美观表格
 */
export function table(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log(WARN('  暂无数据'));
    return;
  }

  const widths = headers.map((h, i) =>
    Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? '')))
  );

  const topBorder = DIM('  ┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐');
  const headerSep = DIM('  ├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤');
  const bottomBorder = DIM('  └' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘');

  console.log(topBorder);
  console.log(
    DIM('  │') +
      headers.map((h, i) => ' ' + ACCENT.bold(padDisplay(h, widths[i]!)) + ' ').join(DIM('│')) +
      DIM('│')
  );
  console.log(headerSep);
  for (const row of rows) {
    console.log(
      DIM('  │') +
        row.map((cell, i) => ' ' + padDisplay(cell ?? '', widths[i]!) + ' ').join(DIM('│')) +
        DIM('│')
    );
  }
  console.log(bottomBorder);
  console.log(DIM(`  共 ${rows.length} 条记录`));
}

/**
 * 键值对信息框
 */
export function kvBox(title: string, items: [string, string][]): void {
  const maxKeyLen = Math.max(...items.map(([k]) => displayWidth(k)));
  console.log('');
  console.log(ACCENT.bold(`  ▸ ${title}`));
  console.log(DIM('  ' + '─'.repeat(40)));
  for (const [key, value] of items) {
    console.log(`    ${DIM(padDisplay(key, maxKeyLen))}  ${chalk.white(value)}`);
  }
}

/**
 * 提示信息框
 */
export function tipBox(title: string, lines: string[]): void {
  const maxLen = Math.max(displayWidth(title) + 2, ...lines.map((l) => displayWidth(l) + 4));
  const width = Math.min(maxLen, 60);
  console.log('');
  console.log(WARN('  ┌' + '─'.repeat(width) + '┐'));
  console.log(WARN('  │') + WARN.bold(` ${title}`) + ' '.repeat(Math.max(0, width - displayWidth(title) - 1)) + WARN('│'));
  console.log(WARN('  ├' + '─'.repeat(width) + '┤'));
  for (const line of lines) {
    console.log(WARN('  │') + ` ${line}` + ' '.repeat(Math.max(0, width - displayWidth(line) - 1)) + WARN('│'));
  }
  console.log(WARN('  └' + '─'.repeat(width) + '┘'));
}

/**
 * 结束分隔
 */
export function footer(): void {
  console.log('');
}

/**
 * 带颜色的状态标签
 */
export function statusTag(status: string): string {
  switch (status) {
    case '待开始': return chalk.bgHex('#555').white(` ${status} `);
    case '进行中': return chalk.bgHex('#2563EB').white(` ${status} `);
    case '已完成': return chalk.bgHex('#16A34A').white(` ${status} `);
    case '已暂停': return chalk.bgHex('#D97706').white(` ${status} `);
    default: return chalk.bgGray(` ${status} `);
  }
}

/**
 * 带颜色的优先级标签
 */
export function priorityTag(priority: string): string {
  switch (priority) {
    case 'P0': return chalk.bgRed.white.bold(` ${priority} `);
    case 'P1': return chalk.bgHex('#EA580C').white(` ${priority} `);
    case 'P2': return chalk.bgHex('#2563EB').white(` ${priority} `);
    case 'P3': return chalk.bgGray.white(` ${priority} `);
    default: return priority;
  }
}

function displayWidth(str: string): number {
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (const ch of stripped) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padDisplay(str: string, targetWidth: number): string {
  const diff = targetWidth - displayWidth(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}
