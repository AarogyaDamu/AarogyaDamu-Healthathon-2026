import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      // npm workspaces hoist zod to the monorepo root.
      'zod': path.resolve(__dirname, 'node_modules/zod'),
      '@aarogyadamu/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
    },
  },
});
