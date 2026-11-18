'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

for (const directory of ['dist', 'release', 'coverage']) {
  fs.rmSync(path.join(projectRoot, directory), { recursive: true, force: true });
}
