const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const testsDir = path.join(mobileDir, 'tests');

function discoverTestFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        files = files.concat(discoverTestFiles(fullPath));
      }
    } else if (entry.isFile() && /\.test\.[cm]?[jt]sx?$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const userArgs = process.argv.slice(2);
const testFiles = userArgs.length > 0 ? userArgs : discoverTestFiles(testsDir).sort();

if (testFiles.length === 0) {
  console.error('No test files found under', testsDir);
  process.exit(1);
}

const hasTs = testFiles.some((f) => /\.[cm]?tsx?$/i.test(f));
const nodeArgs = hasTs
  ? ['--import', 'tsx', '--test', ...testFiles]
  : ['--test', ...testFiles];

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: mobileDir,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
