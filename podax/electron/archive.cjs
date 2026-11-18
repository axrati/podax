'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const fsPromises = fs.promises;
const scrypt = promisify(crypto.scrypt);

const MAGIC = Buffer.from('PODAX02\0', 'ascii');
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const OUTER_HEADER_LENGTH = MAGIC.length + SALT_LENGTH + IV_LENGTH;
const MAX_FRAME_HEADER_LENGTH = 64 * 1024;
const MAX_PASSWORD_LENGTH = 4096;
const MAX_OUTPUT_NAME_BYTES = 220;
const MAX_LEGACY_ARCHIVE_BYTES = 64 * 1024 * 1024;
const OUTPUT_FILE_MODE = 0o600;
const OUTPUT_DIRECTORY_MODE = 0o700;
const CURRENT_SCRYPT_OPTIONS = Object.freeze({
  N: 131_072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
});
const LEGACY_SCRYPT_OPTIONS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
let keyDerivationQueue = Promise.resolve();
let outputCommitQueue = Promise.resolve();

class PodaxError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PodaxError';
    this.code = code;
  }
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new PodaxError('PASSWORD_REQUIRED', 'Enter a password before continuing.');
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PodaxError('PASSWORD_TOO_LONG', 'The password is too long.');
  }
}

function assertEncryptionPassword(password) {
  assertPassword(password);
  if (password.length < 12) {
    throw new PodaxError(
      'WEAK_PASSWORD',
      'Use at least 12 characters for a new archive password.',
    );
  }
}

function assertLegacyPassword(password) {
  if (typeof password !== 'string') {
    throw new PodaxError('PASSWORD_REQUIRED', 'Enter a password before continuing.');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PodaxError('PASSWORD_TOO_LONG', 'The password is too long.');
  }
}

function assertPathInput(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    throw new PodaxError('PATH_REQUIRED', 'Choose a file or folder before continuing.');
  }
}

async function deriveKey(password, salt, options) {
  const previousDerivation = keyDerivationQueue;
  let releaseDerivation;
  keyDerivationQueue = new Promise((resolve) => {
    releaseDerivation = resolve;
  });
  await previousDerivation;
  try {
    return await scrypt(password, salt, 32, options);
  } finally {
    releaseDerivation();
  }
}

function encodeFrameHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  if (json.length === 0 || json.length > MAX_FRAME_HEADER_LENGTH) {
    throw new PodaxError('INVALID_ARCHIVE', 'An archive entry has invalid metadata.');
  }

  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([length, json]);
}

function endFrame() {
  return Buffer.alloc(4);
}

function safeMode(mode, fallback) {
  return Number.isInteger(mode) ? mode & 0o777 : fallback;
}

function safeRestoredMode(mode, isDirectory) {
  if (isDirectory) {
    return OUTPUT_DIRECTORY_MODE;
  }
  return OUTPUT_FILE_MODE | (safeMode(mode, OUTPUT_FILE_MODE) & 0o100);
}

function safeTime(value) {
  return Number.isFinite(value) && value >= 0 ? value : Date.now();
}

function archiveHeader(type, parts, stats) {
  return {
    type,
    parts,
    size: type === 'file' ? stats.size : 0,
    mode: safeMode(stats.mode, type === 'file' ? OUTPUT_FILE_MODE : OUTPUT_DIRECTORY_MODE),
    mtimeMs: safeTime(stats.mtimeMs),
  };
}

function sourceSnapshotMatches(expected, actual, type) {
  return (
    (type === 'file' ? actual.isFile() : actual.isDirectory()) &&
    expected.dev === actual.dev &&
    expected.ino === actual.ino &&
    expected.size === actual.size &&
    expected.mtimeMs === actual.mtimeMs &&
    expected.ctimeMs === actual.ctimeMs
  );
}

function assertSourceSnapshot(expected, actual, type) {
  if (!sourceSnapshotMatches(expected, actual, type)) {
    throw new PodaxError('SOURCE_CHANGED', 'The source changed while it was being encrypted.');
  }
}

async function sourceLstat(sourcePath) {
  try {
    return await fsPromises.lstat(sourcePath);
  } catch (error) {
    throw new PodaxError(
      'SOURCE_CHANGED',
      'The source changed while it was being encrypted.',
      error,
    );
  }
}

async function* sourceFrames(sourcePath, excludedEntry, expectedRootStats) {
  const sourceStats = await sourceLstat(sourcePath);
  const sourceName = path.basename(path.resolve(sourcePath)) || 'Encrypted folder';

  if (sourceStats.isSymbolicLink()) {
    throw new PodaxError('UNSUPPORTED_ENTRY', 'Symbolic links are not supported.');
  }

  if (sourceStats.isFile()) {
    assertSourceSnapshot(expectedRootStats, sourceStats, 'file');
    yield encodeFrameHeader({
      ...archiveHeader('file', [], sourceStats),
      name: sourceName,
    });
    yield* fileChunks(sourcePath, sourceStats);
    yield endFrame();
    return;
  }

  if (!sourceStats.isDirectory()) {
    throw new PodaxError('UNSUPPORTED_ENTRY', 'Only regular files and folders can be encrypted.');
  }
  assertSourceSnapshot(expectedRootStats, sourceStats, 'directory');

  yield encodeFrameHeader({
    ...archiveHeader('directory', [], sourceStats),
    name: sourceName,
  });
  yield* directoryFrames(sourcePath, [], excludedEntry, sourceStats);
  yield endFrame();
}

async function* directoryFrames(directoryPath, parentParts, excludedEntry, expectedStats) {
  const initialStats = await sourceLstat(directoryPath);
  assertSourceSnapshot(expectedStats, initialStats, 'directory');
  let entries;
  try {
    entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    throw new PodaxError(
      'SOURCE_CHANGED',
      'A source folder changed while it was being encrypted.',
      error,
    );
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const entryParts = [...parentParts, entry.name];
    const stats = await sourceLstat(entryPath);

    if (
      excludedEntry &&
      entry.name === excludedEntry.name &&
      stats.dev === excludedEntry.dev &&
      stats.ino === excludedEntry.ino
    ) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      throw new PodaxError(
        'UNSUPPORTED_ENTRY',
        `Symbolic links are not supported (${entryParts.join('/')}).`,
      );
    }

    if (stats.isDirectory()) {
      yield encodeFrameHeader(archiveHeader('directory', entryParts, stats));
      yield* directoryFrames(entryPath, entryParts, excludedEntry, stats);
      continue;
    }

    if (stats.isFile()) {
      yield encodeFrameHeader(archiveHeader('file', entryParts, stats));
      yield* fileChunks(entryPath, stats);
      continue;
    }

    throw new PodaxError(
      'UNSUPPORTED_ENTRY',
      `Unsupported filesystem entry (${entryParts.join('/')}).`,
    );
  }

  const finalStats = await sourceLstat(directoryPath);
  assertSourceSnapshot(initialStats, finalStats, 'directory');
}

async function* fileChunks(filePath, expectedStats) {
  let bytesRead = 0;
  let handle;
  try {
    const noFollow = Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0;
    handle = await fsPromises.open(filePath, fs.constants.O_RDONLY | noFollow);
    const initialStats = await handle.stat();
    assertSourceSnapshot(expectedStats, initialStats, 'file');
    const stream = fs.createReadStream(filePath, {
      fd: handle.fd,
      autoClose: false,
      highWaterMark: 1024 * 1024,
    });

    for await (const chunk of stream) {
      bytesRead += chunk.length;
      yield chunk;
    }

    const finalStats = await handle.stat();
    assertSourceSnapshot(initialStats, finalStats, 'file');
    if (bytesRead !== expectedStats.size) {
      throw new PodaxError('SOURCE_CHANGED', 'A source file changed while it was being encrypted.');
    }
  } catch (error) {
    if (error instanceof PodaxError) {
      throw error;
    }
    throw new PodaxError(
      'SOURCE_CHANGED',
      'A source file changed while it was being encrypted.',
      error,
    );
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

async function writeAll(fileHandle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await fileHandle.write(buffer, offset, buffer.length - offset);
    if (bytesWritten === 0) {
      throw new PodaxError('WRITE_FAILED', 'The encrypted output could not be written.');
    }
    offset += bytesWritten;
  }
}

function encryptedFileName() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(5).toString('hex');
  return `Podax-${timestamp}-${suffix}.podax`;
}

async function encryptPath({ sourcePath, password, outputDirectory }) {
  assertPathInput(sourcePath);
  assertEncryptionPassword(password);
  await ensureOutputDirectory(outputDirectory);

  let sourceStats;
  try {
    sourceStats = await fsPromises.lstat(sourcePath);
  } catch (error) {
    throw new PodaxError('INVALID_SOURCE', 'The selected file or folder is no longer available.', error);
  }

  if (!sourceStats.isFile() && !sourceStats.isDirectory()) {
    throw new PodaxError('UNSUPPORTED_ENTRY', 'Only regular files and folders can be encrypted.');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const initializationVector = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt, CURRENT_SCRYPT_OPTIONS);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, initializationVector);
  const outerHeader = Buffer.concat([MAGIC, salt, initializationVector]);
  cipher.setAAD(outerHeader);

  const outputPath = path.join(outputDirectory, encryptedFileName());
  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(outputPath)}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  const preStagingSourceStats = await sourceLstat(sourcePath);
  assertSourceSnapshot(
    sourceStats,
    preStagingSourceStats,
    sourceStats.isFile() ? 'file' : 'directory',
  );
  const outputDirectoryStats = await sourceLstat(outputDirectory);
  const sourceIsOutputDirectory =
    sourceStats.isDirectory() &&
    sourceStats.dev === outputDirectoryStats.dev &&
    sourceStats.ino === outputDirectoryStats.ino;
  let handle;

  try {
    handle = await fsPromises.open(temporaryPath, 'wx', OUTPUT_FILE_MODE);
    const temporaryStats = await handle.stat();
    const excludedEntry = {
      name: path.basename(temporaryPath),
      dev: temporaryStats.dev,
      ino: temporaryStats.ino,
    };
    const traversalSourceStats = await sourceLstat(sourcePath);
    if (sourceIsOutputDirectory) {
      if (
        !traversalSourceStats.isDirectory() ||
        traversalSourceStats.dev !== sourceStats.dev ||
        traversalSourceStats.ino !== sourceStats.ino
      ) {
        throw new PodaxError('SOURCE_CHANGED', 'The source changed while it was being encrypted.');
      }
    } else {
      assertSourceSnapshot(
        preStagingSourceStats,
        traversalSourceStats,
        sourceStats.isFile() ? 'file' : 'directory',
      );
    }
    await writeAll(handle, outerHeader);

    for await (const plainChunk of sourceFrames(
      sourcePath,
      excludedEntry,
      traversalSourceStats,
    )) {
      const encryptedChunk = cipher.update(plainChunk);
      if (encryptedChunk.length > 0) {
        await writeAll(handle, encryptedChunk);
      }
    }

    const finalChunk = cipher.final();
    if (finalChunk.length > 0) {
      await writeAll(handle, finalChunk);
    }
    await writeAll(handle, cipher.getAuthTag());
    await handle.sync();
    await handle.close();
    handle = undefined;
    await commitTemporaryFile(temporaryPath, outputPath);
    return outputPath;
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fsPromises.rm(temporaryPath, { force: true }).catch(() => {});
    if (error instanceof PodaxError) {
      throw error;
    }
    throw new PodaxError('ENCRYPT_FAILED', 'Encryption failed before the output was completed.', error);
  }
}

async function commitTemporaryFile(temporaryPath, outputPath) {
  const temporaryMetadata = await prepareTemporaryFile(temporaryPath);

  try {
    await fsPromises.link(temporaryPath, outputPath);
    await syncParentDirectory(outputPath);
    await fsPromises.rm(temporaryPath, { force: true });
    await syncParentDirectory(outputPath);
    return;
  } catch (error) {
    if (!['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EINVAL', 'ENOSYS', 'EMLINK'].includes(error.code)) {
      throw error;
    }
  }

  const fallbackPath = path.join(
    path.dirname(outputPath),
    `.podax-commit-${crypto.randomBytes(12).toString('hex')}.tmp`,
  );

  try {
    await fsPromises.copyFile(temporaryPath, fallbackPath, fs.constants.COPYFILE_EXCL);
    const outputHandle = await fsPromises.open(fallbackPath, 'r+');
    try {
      await outputHandle.chmod(temporaryMetadata.mode).catch(() => {});
      await outputHandle
        .utimes(temporaryMetadata.atime, temporaryMetadata.mtime)
        .catch(() => {});
      await outputHandle.sync();
    } finally {
      await outputHandle.close();
    }

    try {
      await fsPromises.lstat(outputPath);
      const collision = new Error('The output path already exists.');
      collision.code = 'EEXIST';
      throw collision;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fsPromises.rename(fallbackPath, outputPath);
    await syncParentDirectory(outputPath);
    await fsPromises.rm(temporaryPath, { force: true });
    await syncParentDirectory(outputPath);
  } catch (error) {
    await fsPromises.rm(fallbackPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function prepareTemporaryFile(temporaryPath) {
  const temporaryHandle = await fsPromises.open(temporaryPath, 'r+');
  try {
    const stats = await temporaryHandle.stat();
    const mode = OUTPUT_FILE_MODE | (stats.mode & 0o100);
    await temporaryHandle.chmod(mode).catch(() => {});
    await temporaryHandle.sync();
    return { atime: stats.atime, mode, mtime: stats.mtime };
  } finally {
    await temporaryHandle.close();
  }
}

async function syncParentDirectory(targetPath) {
  let directoryHandle;
  try {
    directoryHandle = await fsPromises.open(path.dirname(targetPath), 'r');
    await directoryHandle.sync();
  } catch {
    // Some filesystems and Windows do not support opening or syncing directories.
  } finally {
    if (directoryHandle) {
      await directoryHandle.close().catch(() => {});
    }
  }
}

async function writePrivateFile(outputPath, data) {
  const handle = await fsPromises.open(outputPath, 'wx', OUTPUT_FILE_MODE);
  try {
    await writeAll(handle, data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function withOutputCommitLock(operation) {
  const previousCommit = outputCommitQueue;
  let releaseCommit;
  outputCommitQueue = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  await previousCommit;
  try {
    return await operation();
  } finally {
    releaseCommit();
  }
}

function isSafeStoredPart(part) {
  return (
    typeof part === 'string' &&
    part.length > 0 &&
    part !== '.' &&
    part !== '..' &&
    !part.includes('\0')
  );
}

function truncateUtf8(value, byteLimit) {
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > byteLimit) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function truncatePortableName(value) {
  if (Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_NAME_BYTES) {
    return value;
  }

  const candidateExtension = path.extname(value);
  const extension =
    Buffer.byteLength(candidateExtension, 'utf8') <= 64 ? candidateExtension : '';
  const stem = extension ? value.slice(0, -extension.length) : value;
  const stemBudget = MAX_OUTPUT_NAME_BYTES - Buffer.byteLength(extension, 'utf8');
  return `${truncateUtf8(stem, stemBudget)}${extension}`;
}

function sanitizeOutputName(name) {
  let result = typeof name === 'string' ? name.normalize('NFC') : '';
  result = [...result]
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  result = truncatePortableName(result);

  if (
    /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu.test(
      result,
    )
  ) {
    result = `_${result}`;
  }

  return result || 'Recovered item';
}

async function unusedPath(parent, requestedName) {
  const safeName = sanitizeOutputName(requestedName);
  const extension = path.extname(safeName);
  const stem = path.basename(safeName, extension);

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const candidate = path.join(parent, `${stem}${suffix}${extension}`);
    try {
      await fsPromises.lstat(candidate);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return candidate;
      }
      throw error;
    }
  }

  throw new PodaxError('WRITE_FAILED', 'A unique output name could not be created.');
}

class FrameExtractor {
  constructor(outputDirectory) {
    this.outputDirectory = outputDirectory;
    this.buffer = Buffer.alloc(0);
    this.expectedHeaderLength = null;
    this.currentFile = null;
    this.currentFileRemaining = 0;
    this.rootType = null;
    this.rootName = null;
    this.stagingPath = null;
    this.complete = false;
    this.seenRoot = false;
    this.actualDirectories = new Map();
    this.directoryMetadata = [];
  }

  async consume(chunk) {
    if (!chunk || chunk.length === 0) {
      return;
    }
    if (this.complete) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive contains data after its end marker.');
    }

    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    await this.processBuffer();
  }

  async processBuffer() {
    while (this.buffer.length > 0) {
      if (this.currentFile) {
        const writeLength = Math.min(this.currentFileRemaining, this.buffer.length);
        const fileChunk = this.buffer.subarray(0, writeLength);
        await writeAll(this.currentFile, fileChunk);
        this.buffer = this.buffer.subarray(writeLength);
        this.currentFileRemaining -= writeLength;
        if (this.currentFileRemaining === 0) {
          await this.currentFile.sync();
          await this.currentFile.close();
          this.currentFile = null;
          if (this.currentFileMetadata) {
            await applyMetadata(
              this.currentFileMetadata.path,
              this.currentFileMetadata.header,
              false,
            );
            this.currentFileMetadata = null;
          }
        }
        continue;
      }

      if (this.expectedHeaderLength === null) {
        if (this.buffer.length < 4) {
          return;
        }
        this.expectedHeaderLength = this.buffer.readUInt32BE(0);
        this.buffer = this.buffer.subarray(4);
        if (this.expectedHeaderLength === 0) {
          this.expectedHeaderLength = null;
          this.complete = true;
          if (this.buffer.length > 0) {
            throw new PodaxError('INVALID_ARCHIVE', 'The archive contains trailing data.');
          }
          return;
        }
        if (this.expectedHeaderLength > MAX_FRAME_HEADER_LENGTH) {
          throw new PodaxError('INVALID_ARCHIVE', 'An archive entry has oversized metadata.');
        }
      }

      if (this.buffer.length < this.expectedHeaderLength) {
        return;
      }

      const headerBuffer = this.buffer.subarray(0, this.expectedHeaderLength);
      this.buffer = this.buffer.subarray(this.expectedHeaderLength);
      this.expectedHeaderLength = null;

      let header;
      try {
        header = JSON.parse(headerBuffer.toString('utf8'));
      } catch (error) {
        throw new PodaxError('INVALID_ARCHIVE', 'The archive metadata is damaged.', error);
      }
      await this.startEntry(header);
    }
  }

  validateHeader(header) {
    if (!header || (header.type !== 'file' && header.type !== 'directory')) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive contains an unsupported entry.');
    }
    if (!Array.isArray(header.parts) || !header.parts.every(isSafeStoredPart)) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive contains an unsafe path.');
    }
    if (!Number.isSafeInteger(header.size) || header.size < 0) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive contains an invalid file size.');
    }
    if (header.type === 'directory' && header.size !== 0) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive contains invalid folder metadata.');
    }
  }

  async startEntry(header) {
    this.validateHeader(header);

    if (!this.seenRoot) {
      if (header.parts.length !== 0 || typeof header.name !== 'string' || header.name.length === 0) {
        throw new PodaxError('INVALID_ARCHIVE', 'The archive root is invalid.');
      }
      this.seenRoot = true;
      this.rootType = header.type;
      this.rootName = sanitizeOutputName(header.name);
      this.stagingPath = path.join(
        this.outputDirectory,
        `.podax-${crypto.randomBytes(12).toString('hex')}.tmp`,
      );

      if (header.type === 'directory') {
        await fsPromises.mkdir(this.stagingPath, { mode: OUTPUT_DIRECTORY_MODE });
        this.actualDirectories.set(JSON.stringify([]), this.stagingPath);
        this.directoryMetadata.push({ path: this.stagingPath, header });
      } else {
        this.currentFile = await fsPromises.open(this.stagingPath, 'wx', OUTPUT_FILE_MODE);
        this.currentFileRemaining = header.size;
        this.rootFileMetadata = header;
        if (header.size === 0) {
          await this.currentFile.close();
          this.currentFile = null;
        }
      }
      return;
    }

    if (this.rootType !== 'directory' || header.parts.length === 0) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive hierarchy is invalid.');
    }

    const parentKey = JSON.stringify(header.parts.slice(0, -1));
    const currentKey = JSON.stringify(header.parts);
    const parentPath = this.actualDirectories.get(parentKey);
    if (!parentPath) {
      throw new PodaxError('INVALID_ARCHIVE', 'An archive entry has no valid parent folder.');
    }

    const outputPath = await unusedPath(parentPath, header.parts.at(-1));
    if (header.type === 'directory') {
      await fsPromises.mkdir(outputPath, { mode: OUTPUT_DIRECTORY_MODE });
      this.actualDirectories.set(currentKey, outputPath);
      this.directoryMetadata.push({ path: outputPath, header });
      return;
    }

    this.currentFile = await fsPromises.open(outputPath, 'wx', OUTPUT_FILE_MODE);
    this.currentFileRemaining = header.size;
    this.currentFileMetadata = { path: outputPath, header };
    if (header.size === 0) {
      await this.currentFile.close();
      this.currentFile = null;
      await applyMetadata(outputPath, header, false);
    }
  }

  async finish() {
    if (!this.complete || !this.seenRoot || this.currentFile || this.expectedHeaderLength !== null) {
      throw new PodaxError('INVALID_ARCHIVE', 'The archive ended unexpectedly.');
    }

    if (this.rootType === 'file') {
      await applyMetadata(this.stagingPath, this.rootFileMetadata, false);
    } else {
      for (const metadata of [...this.directoryMetadata].reverse()) {
        await applyMetadata(metadata.path, metadata.header, true);
      }
    }
  }

  async abort() {
    if (this.currentFile) {
      await this.currentFile.close().catch(() => {});
      this.currentFile = null;
    }
    if (this.stagingPath) {
      await fsPromises.rm(this.stagingPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function applyMetadata(outputPath, header, isDirectory) {
  const mode = safeRestoredMode(header.mode, isDirectory);
  const modified = new Date(safeTime(header.mtimeMs));
  await fsPromises.chmod(outputPath, mode).catch(() => {});
  await fsPromises.utimes(outputPath, modified, modified).catch(() => {});
}

async function decryptVersionTwo(encryptedPath, password, outputDirectory) {
  const handle = await fsPromises.open(encryptedPath, 'r');
  let stats;

  try {
    stats = await handle.stat();
    if (stats.size <= OUTER_HEADER_LENGTH + AUTH_TAG_LENGTH) {
      throw new PodaxError('INVALID_ARCHIVE', 'The encrypted file is incomplete.');
    }

    const outerHeader = Buffer.alloc(OUTER_HEADER_LENGTH);
    const authenticationTag = Buffer.alloc(AUTH_TAG_LENGTH);
    await readExactly(handle, outerHeader, 0);
    await readExactly(handle, authenticationTag, stats.size - AUTH_TAG_LENGTH);

    const salt = outerHeader.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH);
    const initializationVector = outerHeader.subarray(MAGIC.length + SALT_LENGTH);
    const key = await deriveKey(password, salt, CURRENT_SCRYPT_OPTIONS);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, initializationVector);
    decipher.setAAD(outerHeader);
    decipher.setAuthTag(authenticationTag);
    const extractor = new FrameExtractor(outputDirectory);

    try {
      const encryptedStream = fs.createReadStream(encryptedPath, {
        fd: handle.fd,
        autoClose: false,
        start: OUTER_HEADER_LENGTH,
        end: stats.size - AUTH_TAG_LENGTH - 1,
        highWaterMark: 1024 * 1024,
      });

      for await (const encryptedChunk of encryptedStream) {
        await extractor.consume(decipher.update(encryptedChunk));
      }
      await extractor.consume(decipher.final());
      await extractor.finish();

      const destination = await withOutputCommitLock(async () => {
        const availablePath = await unusedPath(outputDirectory, extractor.rootName);
        if (extractor.rootType === 'file') {
          await commitTemporaryFile(extractor.stagingPath, availablePath);
        } else {
          await fsPromises.rename(extractor.stagingPath, availablePath);
          await syncParentDirectory(availablePath);
        }
        return availablePath;
      });
      extractor.stagingPath = null;
      return destination;
    } catch (error) {
      await extractor.abort();
      if (error instanceof PodaxError) {
        throw error;
      }
      throw new PodaxError(
        'DECRYPT_FAILED',
        'Decryption failed. Check that the file and password are correct.',
        error,
      );
    }
  } finally {
    await handle.close();
  }
}

async function readExactly(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      throw new PodaxError('INVALID_ARCHIVE', 'The encrypted file ended unexpectedly.');
    }
    offset += bytesRead;
  }
}

async function decryptLegacy(encryptedPath, password, outputDirectory) {
  assertLegacyPassword(password);
  let payload;
  let encryptedHandle;
  try {
    const noFollow = Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0;
    encryptedHandle = await fsPromises.open(encryptedPath, fs.constants.O_RDONLY | noFollow);
    const encryptedStats = await encryptedHandle.stat();
    if (!encryptedStats.isFile()) {
      throw new PodaxError('INVALID_SOURCE', 'The selected encrypted file is not a regular file.');
    }
    if (encryptedStats.size > MAX_LEGACY_ARCHIVE_BYTES) {
      throw new PodaxError(
        'LEGACY_TOO_LARGE',
        'This legacy archive is too large to restore safely. Use the Podax version that created it, then re-encrypt the restored data.',
      );
    }
    if (encryptedStats.size <= 16) {
      throw new Error('Legacy file is too short.');
    }
    const encrypted = Buffer.allocUnsafe(encryptedStats.size);
    await readExactly(encryptedHandle, encrypted, 0);
    const finalStats = await encryptedHandle.stat();
    if (!sourceSnapshotMatches(encryptedStats, finalStats, 'file')) {
      throw new PodaxError(
        'INVALID_SOURCE',
        'The selected encrypted file changed while it was being read.',
      );
    }
    const initializationVector = encrypted.subarray(0, 16);
    const legacySalt = Buffer.from(password).toString('base64');
    const key = await deriveKey(password, legacySalt, LEGACY_SCRYPT_OPTIONS);
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, initializationVector);
    const plain = Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]);
    payload = JSON.parse(plain.toString('utf8'));
  } catch (error) {
    if (error instanceof PodaxError) {
      throw error;
    }
    throw new PodaxError(
      'DECRYPT_FAILED',
      'Decryption failed. Check that the file and password are correct.',
      error,
    );
  } finally {
    if (encryptedHandle) {
      await encryptedHandle.close().catch(() => {});
    }
  }

  const rootName = sanitizeOutputName(payload?.file_name);
  const stagingPath = path.join(
    outputDirectory,
    `.podax-${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
  let ownsStagingPath = true;

  try {
    if (payload?.obj_type === 'file') {
      if (typeof payload.file_data !== 'string') {
        throw new PodaxError('INVALID_ARCHIVE', 'The legacy file payload is invalid.');
      }
      await writePrivateFile(stagingPath, Buffer.from(payload.file_data, 'base64'));
      const destination = await withOutputCommitLock(async () => {
        const availablePath = await unusedPath(outputDirectory, rootName);
        await commitTemporaryFile(stagingPath, availablePath);
        return availablePath;
      });
      ownsStagingPath = false;
      return destination;
    }

    if (payload?.obj_type !== 'folder' || !Array.isArray(payload.children)) {
      throw new PodaxError('INVALID_ARCHIVE', 'The legacy archive type is not supported.');
    }

    await fsPromises.mkdir(stagingPath, { mode: OUTPUT_DIRECTORY_MODE });
    await restoreLegacyChildren(payload.children, stagingPath);
    const destination = await withOutputCommitLock(async () => {
      const availablePath = await unusedPath(outputDirectory, rootName);
      await fsPromises.rename(stagingPath, availablePath);
      await syncParentDirectory(availablePath);
      return availablePath;
    });
    ownsStagingPath = false;
    return destination;
  } catch (error) {
    if (ownsStagingPath) {
      await fsPromises.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
    }
    if (error instanceof PodaxError) {
      throw error;
    }
    throw new PodaxError('WRITE_FAILED', 'The decrypted output could not be written.', error);
  }
}

async function restoreLegacyChildren(children, parentPath) {
  for (const child of children) {
    const childName = sanitizeOutputName(child?.file_name);
    const childPath = await unusedPath(parentPath, childName);

    if (child?.obj_type === 'folder' && Array.isArray(child.children)) {
      await fsPromises.mkdir(childPath, { mode: OUTPUT_DIRECTORY_MODE });
      await restoreLegacyChildren(child.children, childPath);
      continue;
    }

    if (child?.obj_type === 'file' && typeof child.file_data === 'string') {
      await writePrivateFile(childPath, Buffer.from(child.file_data, 'base64'));
      continue;
    }

    throw new PodaxError('INVALID_ARCHIVE', 'The legacy archive contains an invalid entry.');
  }
}

async function decryptFile({ encryptedPath, password, outputDirectory }) {
  assertPathInput(encryptedPath);
  await ensureOutputDirectory(outputDirectory);

  let handle;
  try {
    handle = await fsPromises.open(encryptedPath, 'r');
    const prefix = Buffer.alloc(MAGIC.length);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length) {
      throw new PodaxError('INVALID_ARCHIVE', 'The selected encrypted file is incomplete.');
    }
    await handle.close();
    handle = undefined;

    if (prefix.equals(MAGIC)) {
      assertPassword(password);
      return await decryptVersionTwo(encryptedPath, password, outputDirectory);
    }
    return await decryptLegacy(encryptedPath, password, outputDirectory);
  } catch (error) {
    if (error instanceof PodaxError) {
      throw error;
    }
    throw new PodaxError('INVALID_SOURCE', 'The selected encrypted file is no longer available.', error);
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

async function ensureOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== 'string' || outputDirectory.trim() === '') {
    throw new PodaxError('WRITE_FAILED', 'The output folder is unavailable.');
  }
  await fsPromises.mkdir(outputDirectory, { recursive: true, mode: OUTPUT_DIRECTORY_MODE });
  await fsPromises.chmod(outputDirectory, OUTPUT_DIRECTORY_MODE).catch(() => {});
}

async function cleanupAbandonedStaging(outputDirectory) {
  await ensureOutputDirectory(outputDirectory);
  let outputEntries;
  try {
    outputEntries = await fsPromises.readdir(outputDirectory, { withFileTypes: true });
  } catch {
    return;
  }
  const outputTemporaryName = /^(?:\.podax-[0-9a-f]{24}|\.podax-commit-[0-9a-f]{24}|\.Podax-\d{14}-[0-9a-f]{10}\.podax\.[0-9a-f]{12})\.tmp$/;

  await Promise.all(
    outputEntries
      .filter((entry) => outputTemporaryName.test(entry.name))
      .map((entry) =>
        fsPromises
          .rm(path.join(outputDirectory, entry.name), { recursive: true, force: true })
          .catch(() => {}),
      ),
  );
}

async function validateSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
    return { type: 'invalid' };
  }

  try {
    const stats = await fsPromises.lstat(sourcePath);
    if (stats.isFile()) {
      return { type: 'file' };
    }
    if (stats.isDirectory()) {
      return { type: 'directory' };
    }
  } catch {
    // The renderer only needs a safe invalid result; filesystem details stay private.
  }

  return { type: 'invalid' };
}

module.exports = {
  MAGIC,
  PodaxError,
  cleanupAbandonedStaging,
  decryptFile,
  encryptPath,
  sanitizeOutputName,
  validateSourcePath,
};
