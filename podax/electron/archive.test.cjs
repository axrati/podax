'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');
const { promisify } = require('node:util');
const {
  MAGIC,
  cleanupAbandonedStaging,
  decryptFile,
  encryptPath,
  sanitizeOutputName,
  validateSourcePath,
} = require('./archive.cjs');

const scrypt = promisify(crypto.scrypt);

describe('Podax archive service', () => {
  let temporaryRoot;
  let outputDirectory;

  beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'podax-test-'));
    outputDirectory = path.join(temporaryRoot, 'output');
  });

  afterEach(async () => {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  });

  test('streams a file through the authenticated v2 format', async () => {
    const sourcePath = path.join(temporaryRoot, 'sample.bin');
    const sourceData = crypto.randomBytes(3 * 1024 * 1024 + 137);
    await fs.writeFile(sourcePath, sourceData);

    const encryptedPath = await encryptPath({
      sourcePath,
      password: 'a long test password',
      outputDirectory,
    });
    const prefix = (await fs.readFile(encryptedPath)).subarray(0, MAGIC.length);
    assert.deepEqual(prefix, MAGIC);

    const restoredPath = await decryptFile({
      encryptedPath,
      password: 'a long test password',
      outputDirectory,
    });
    assert.equal(path.basename(restoredPath), 'sample.bin');
    assert.deepEqual(await fs.readFile(restoredPath), sourceData);
  });

  test('preserves nested folders, empty folders, dotfiles, and unique output names', async () => {
    const sourcePath = path.join(temporaryRoot, 'portable-folder');
    await fs.mkdir(path.join(sourcePath, 'nested', 'empty'), { recursive: true });
    await fs.writeFile(path.join(sourcePath, 'nested', 'message.txt'), 'hello across platforms');
    await fs.writeFile(path.join(sourcePath, '.hidden'), 'hidden data');
    await fs.chmod(path.join(sourcePath, 'nested', 'message.txt'), 0o777);

    const encryptedPath = await encryptPath({
      sourcePath,
      password: 'folder password',
      outputDirectory,
    });
    const restoredPath = await decryptFile({
      encryptedPath,
      password: 'folder password',
      outputDirectory,
    });
    const secondRestoredPath = await decryptFile({
      encryptedPath,
      password: 'folder password',
      outputDirectory,
    });

    assert.equal(await fs.readFile(path.join(restoredPath, 'nested', 'message.txt'), 'utf8'), 'hello across platforms');
    assert.equal(await fs.readFile(path.join(restoredPath, '.hidden'), 'utf8'), 'hidden data');
    assert.equal((await fs.stat(path.join(restoredPath, 'nested', 'empty'))).isDirectory(), true);
    if (process.platform !== 'win32') {
      assert.equal(
        (await fs.stat(path.join(restoredPath, 'nested', 'message.txt'))).mode & 0o777,
        0o700,
      );
      assert.equal((await fs.stat(path.join(restoredPath, 'nested'))).mode & 0o777, 0o700);
    }
    assert.equal(path.basename(secondRestoredPath), 'portable-folder (1)');
  });

  test('does not include its temporary output when the destination is inside the source', async () => {
    const sourcePath = path.join(temporaryRoot, 'source-and-output');
    const separateOutput = path.join(temporaryRoot, 'restored');
    await fs.mkdir(sourcePath);
    await fs.writeFile(path.join(sourcePath, 'only-source.txt'), 'source data');

    const encryptedPath = await encryptPath({
      sourcePath,
      password: 'self containment password',
      outputDirectory: sourcePath,
    });
    const restoredPath = await decryptFile({
      encryptedPath,
      password: 'self containment password',
      outputDirectory: separateOutput,
    });

    assert.deepEqual(await fs.readdir(restoredPath), ['only-source.txt']);
    assert.equal(await fs.readFile(path.join(restoredPath, 'only-source.txt'), 'utf8'), 'source data');
  });

  test('rejects a same-size source edit made while encryption is starting', async () => {
    const sourcePath = path.join(temporaryRoot, 'changing-source.txt');
    await fs.writeFile(sourcePath, 'first');

    const encryption = encryptPath({
      sourcePath,
      password: 'source mutation password',
      outputDirectory,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(sourcePath, 'later');

    await assert.rejects(encryption, (error) => error.code === 'SOURCE_CHANGED');
    assert.deepEqual(await fs.readdir(outputDirectory), []);
  });

  test('rejects a wrong password or modified ciphertext without committing output', async () => {
    const sourcePath = path.join(temporaryRoot, 'secret.txt');
    await fs.writeFile(sourcePath, 'untampered');
    const encryptedPath = await encryptPath({
      sourcePath,
      password: 'correct password',
      outputDirectory,
    });

    await assert.rejects(
      decryptFile({
        encryptedPath,
        password: 'wrong password',
        outputDirectory,
      }),
    );

    const encrypted = await fs.readFile(encryptedPath);
    encrypted[Math.floor(encrypted.length / 2)] ^= 0xff;
    const modifiedPath = path.join(temporaryRoot, 'modified.podax');
    await fs.writeFile(modifiedPath, encrypted);
    await assert.rejects(
      decryptFile({
        encryptedPath: modifiedPath,
        password: 'correct password',
        outputDirectory,
      }),
    );

    const outputEntries = await fs.readdir(outputDirectory);
    assert.deepEqual(outputEntries, [path.basename(encryptedPath)]);
  });

  test('reads legacy AES-CTR files and constrains unsafe stored names', async () => {
    const password = 'legacy password';
    const payload = {
      obj_type: 'folder',
      file_name: '../legacy-folder',
      children: [
        {
          obj_type: 'folder',
          file_name: '../../nested',
          children: [
            {
              obj_type: 'file',
              file_name: '../message.txt',
              file_data: Buffer.from('legacy content').toString('base64'),
            },
          ],
        },
      ],
    };
    const encryptedPath = path.join(temporaryRoot, 'legacy.podax');
    await writeLegacyArchive(encryptedPath, password, payload);

    const restoredPath = await decryptFile({ encryptedPath, password, outputDirectory });
    assert.equal(path.dirname(restoredPath), outputDirectory);
    const [nestedName] = await fs.readdir(restoredPath);
    const [fileName] = await fs.readdir(path.join(restoredPath, nestedName));
    assert.equal(
      await fs.readFile(path.join(restoredPath, nestedName, fileName), 'utf8'),
      'legacy content',
    );
  });

  test('reads original legacy archives created with a blank password', async () => {
    const encryptedPath = path.join(temporaryRoot, 'legacy-blank-password.podax');
    await writeLegacyArchive(encryptedPath, '', {
      obj_type: 'file',
      file_name: 'blank-password.txt',
      file_data: Buffer.from('legacy blank password content').toString('base64'),
    });

    const restoredPath = await decryptFile({
      encryptedPath,
      password: '',
      outputDirectory,
    });

    assert.equal(await fs.readFile(restoredPath, 'utf8'), 'legacy blank password content');
  });

  test('commits concurrent legacy restores without mixing or deleting output', async () => {
    const password = 'legacy concurrency password';
    const children = Array.from({ length: 60 }, (_, index) => ({
      obj_type: 'file',
      file_name: `item-${index}.txt`,
      file_data: Buffer.from(`content-${index}`).toString('base64'),
    }));
    const encryptedPath = path.join(temporaryRoot, 'legacy-concurrent.podax');
    await writeLegacyArchive(encryptedPath, password, {
      obj_type: 'folder',
      file_name: 'legacy-concurrent',
      children,
    });

    const restoredPaths = await Promise.all(
      Array.from({ length: 6 }, () =>
        decryptFile({ encryptedPath, password, outputDirectory }),
      ),
    );

    assert.equal(new Set(restoredPaths).size, restoredPaths.length);
    for (const restoredPath of restoredPaths) {
      assert.equal((await fs.readdir(restoredPath)).length, children.length);
      assert.equal(await fs.readFile(path.join(restoredPath, 'item-17.txt'), 'utf8'), 'content-17');
    }
  });

  test('rejects oversized legacy input before reading it into memory', async () => {
    const encryptedPath = path.join(temporaryRoot, 'oversized-legacy.podax');
    await fs.writeFile(encryptedPath, Buffer.alloc(8));
    await fs.truncate(encryptedPath, 64 * 1024 * 1024 + 1);

    await assert.rejects(
      decryptFile({ encryptedPath, password: 'password', outputDirectory }),
      (error) => error.code === 'LEGACY_TOO_LARGE',
    );
  });

  test('removes only abandoned staging entries', async () => {
    await fs.mkdir(outputDirectory, { recursive: true });
    const abandonedDirectory = path.join(outputDirectory, `.podax-${'a'.repeat(24)}.tmp`);
    const abandonedArchive = path.join(
      outputDirectory,
      `.Podax-20261117224500-${'b'.repeat(10)}.podax.${'c'.repeat(12)}.tmp`,
    );
    const unrelated = path.join(outputDirectory, '.podax-keep.tmp');
    const abandonedCommit = path.join(
      outputDirectory,
      `.podax-commit-${'d'.repeat(24)}.tmp`,
    );
    await fs.mkdir(abandonedDirectory);
    await fs.writeFile(path.join(abandonedDirectory, 'partial.txt'), 'partial plaintext');
    await fs.writeFile(abandonedArchive, 'partial ciphertext');
    await fs.writeFile(abandonedCommit, 'completed private copy');
    await fs.writeFile(unrelated, 'keep');

    await cleanupAbandonedStaging(outputDirectory);

    assert.deepEqual(await fs.readdir(outputDirectory), ['.podax-keep.tmp']);
  });

  test('rejects symbolic links and reports path types safely', async () => {
    const sourcePath = path.join(temporaryRoot, 'source.txt');
    const linkPath = path.join(temporaryRoot, 'source-link');
    await fs.writeFile(sourcePath, 'content');
    await fs.symlink(sourcePath, linkPath);

    assert.deepEqual(await validateSourcePath(sourcePath), { type: 'file' });
    assert.deepEqual(await validateSourcePath(temporaryRoot), { type: 'directory' });
    assert.deepEqual(await validateSourcePath(linkPath), { type: 'invalid' });
    assert.deepEqual(await validateSourcePath(path.join(temporaryRoot, 'missing')), {
      type: 'invalid',
    });
    await assert.rejects(
      encryptPath({
        sourcePath: linkPath,
        password: 'a valid password',
        outputDirectory,
      }),
      (error) => error.code === 'UNSUPPORTED_ENTRY',
    );
  });

  test('normalizes names that are invalid on common desktop filesystems', () => {
    assert.equal(sanitizeOutputName('../CON:report?.txt '), '.._CON_report_.txt');
    assert.equal(sanitizeOutputName('NUL'), '_NUL');
    assert.equal(sanitizeOutputName('CONIN$'), '_CONIN$');
    assert.equal(sanitizeOutputName('CONOUT$.log'), '_CONOUT$.log');
    assert.equal(sanitizeOutputName('CLOCK$'), '_CLOCK$');
    assert.equal(sanitizeOutputName('COM¹.txt'), '_COM¹.txt');
    assert.equal(sanitizeOutputName('LPT³'), '_LPT³');
    assert.equal(sanitizeOutputName('...'), 'Recovered item');
    const longName = sanitizeOutputName(`${'é'.repeat(200)}.txt`);
    assert.equal(Buffer.byteLength(longName, 'utf8') <= 220, true);
    assert.equal(longName.endsWith('.txt'), true);
  });
});

async function writeLegacyArchive(filePath, password, payload) {
  const initializationVector = crypto.randomBytes(16);
  const salt = Buffer.from(password).toString('base64');
  const key = await scrypt(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-ctr', key, initializationVector);
  const encrypted = Buffer.concat([
    initializationVector,
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
  ]);
  await fs.writeFile(filePath, encrypted);
}
