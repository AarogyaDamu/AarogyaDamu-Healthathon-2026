import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@aarogyadamu/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
});