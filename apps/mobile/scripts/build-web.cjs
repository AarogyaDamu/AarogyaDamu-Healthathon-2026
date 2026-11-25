const { spawnSync } = require('node:child_process');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(
  npxCmd,
  ['expo', 'export', '--platform', 'web', '--clear'],
  {
    cwd: mobileDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1',
    },
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 0);
