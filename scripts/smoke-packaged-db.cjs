'use strict';

// Run with a freshly packaged Electron executable and ELECTRON_RUN_AS_NODE=1.
// This checks the shipped native binding without opening a window or user data.
const path = require('node:path');
const { createRequire } = require('node:module');
const expectedVersion = require('../apps/desktop/package.json').version;
const archive = path.resolve(process.argv[2]);
const packagedRequire = createRequire(path.join(archive, 'package.json'));
const metadata = packagedRequire('./package.json');
if (metadata.version !== expectedVersion) throw new Error('Packaged version mismatch');
const Database = packagedRequire('better-sqlite3');
const database = new Database(':memory:');
try {
  const result = database.prepare('SELECT sqlite_version() AS version').get();
  console.log(JSON.stringify({ version: metadata.version, sqlite: result.version }));
} finally {
  database.close();
}
