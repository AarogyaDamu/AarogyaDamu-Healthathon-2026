const { spawnSync } = require('node:child_process');
const path = require('node:path');
const environment = { ...process.env };
// Prisma 5's database-existence probe depends on structured schema-engine logs.
// An inherited RUST_LOG can suppress those logs and prevent SQLite creation.
delete environment.RUST_LOG;
const prisma = path.resolve(__dirname, '../../../node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [prisma, ...process.argv.slice(2)], { cwd: path.resolve(__dirname, '..'), env: environment, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
