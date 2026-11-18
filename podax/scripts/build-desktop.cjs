'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const argumentsFromNpm = process.argv.slice(2);
const targetsMac =
  argumentsFromNpm.includes('--mac') ||
  (!argumentsFromNpm.some((argument) => ['--win', '--linux'].includes(argument)) &&
    process.platform === 'darwin');

if (targetsMac && !process.env.CSC_LINK && !process.env.CSC_NAME) {
  // Apple Silicon requires a valid signature even for local/PR builds. A real
  // Developer ID supplied through CSC_LINK still takes precedence for releases.
  argumentsFromNpm.push('-c.mac.identity=-');
}

const builderPackage = require.resolve('electron-builder/package.json');
const builderManifest = require(builderPackage);
const builderScript = path.resolve(path.dirname(builderPackage), builderManifest.bin['electron-builder']);
const result = spawnSync(process.execPath, [builderScript, ...argumentsFromNpm], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
