import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@data': resolve('data') } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
