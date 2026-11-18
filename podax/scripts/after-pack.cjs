'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const UNUSED_MAC_PLIST_KEYS = [
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

module.exports = async function removeUnusedMacPermissions(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const infoPlist = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Info.plist');

  execFileSync('/usr/bin/plutil', ['-lint', infoPlist], { stdio: 'inherit' });

  const removedKeys = [];

  for (const key of UNUSED_MAC_PLIST_KEYS) {
    const lookup = spawnSync(
      '/usr/bin/plutil',
      ['-extract', key, 'xml1', '-o', '-', infoPlist],
      { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] },
    );

    if (lookup.error) {
      throw lookup.error;
    }

    if (lookup.status !== 0) {
      continue;
    }

    execFileSync('/usr/bin/plutil', ['-remove', key, infoPlist], { stdio: 'inherit' });
    removedKeys.push(key);
  }

  execFileSync('/usr/bin/plutil', ['-lint', infoPlist], { stdio: 'inherit' });
  console.log(`Removed unused macOS plist entries: ${removedKeys.join(', ') || 'none'}`);
};
