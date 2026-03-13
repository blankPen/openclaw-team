#!/usr/bin/env node
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, '../dist/src/index.js');

if (existsSync(distEntry)) {
  await import(distEntry);
} else {
  // 开发模式：通过 tsx 加载 TypeScript 源码
  const { register } = await import('tsx/esm/api');
  const unregister = register();
  try {
    await import('../src/index.ts');
  } finally {
    unregister();
  }
}
