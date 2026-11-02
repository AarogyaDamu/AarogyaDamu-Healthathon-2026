const fs = require('fs');
const os = require('os');
const path = require('path');

function assertSafeTestDatabase() {
  const dir = process.env.AAROGYADAMU_TEST_DIR;
  const token = process.env.AAROGYADAMU_TEST_TOKEN;
  if (process.env.NODE_ENV !== 'test' || !dir || !token || !path.isAbsolute(dir)) throw new Error('Refusing tests: isolated database authorization is missing.');
  const realDir = fs.realpathSync(dir);
  const temp = fs.realpathSync(os.tmpdir());
  if (path.dirname(realDir) !== temp || !path.basename(realDir).startsWith('aarogyadamu-test-')) throw new Error('Refusing tests: database directory is not an isolated test directory.');
  if (fs.readFileSync(path.join(realDir, '.test-marker'), 'utf8') !== token) throw new Error('Refusing tests: test database marker does not match.');
  const expected = `file:${path.join(realDir, 'test.db').replace(/\\/g, '/')}`;
  if (process.env.DATABASE_URL !== expected) throw new Error('Refusing tests: DATABASE_URL does not match the isolated test database.');
  const databaseFile = path.join(realDir, 'test.db');
  const stat = fs.lstatSync(databaseFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fs.realpathSync(databaseFile) !== databaseFile) throw new Error('Refusing tests: database must be a private regular file.');
}
module.exports = { assertSafeTestDatabase };
