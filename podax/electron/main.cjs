'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
} = require('electron');
const {
  cleanupAbandonedStaging,
  decryptFile,
  encryptPath,
  validateSourcePath,
} = require('./archive.cjs');

const APP_ORIGIN = 'app://bundle';
const DEVELOPMENT_SERVER_URL = (() => {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) {
    return '';
  }
  try {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    if (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    // Invalid development URLs fall back to the local packaged renderer.
  }
  return '';
})();
const RENDERER_DIRECTORY = path.resolve(__dirname, '..', 'dist');
const MAX_PATH_LENGTH = 32_768;
let activeOperation = null;
let allowApplicationExit = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function isTrustedUrl(value) {
  try {
    const url = new URL(value);
    if (DEVELOPMENT_SERVER_URL) {
      return url.origin === new URL(DEVELOPMENT_SERVER_URL).origin;
    }
    return url.protocol === 'app:' && url.host === 'bundle';
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedUrl(senderUrl)) {
    throw new Error('Blocked IPC from an untrusted renderer.');
  }
}

function registerHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
}

function assertRendererPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    throw new Error('Invalid path.');
  }
  return value;
}

function outputDirectory() {
  return path.join(app.getPath('home'), 'Podax');
}

function publicFailure(error, fallback) {
  const allowedCodes = new Set([
    'DECRYPT_FAILED',
    'ENCRYPT_FAILED',
    'INVALID_ARCHIVE',
    'INVALID_SOURCE',
    'LEGACY_TOO_LARGE',
    'OPERATION_IN_PROGRESS',
    'PASSWORD_REQUIRED',
    'PASSWORD_TOO_LONG',
    'PATH_REQUIRED',
    'SOURCE_CHANGED',
    'UNSUPPORTED_ENTRY',
    'WEAK_PASSWORD',
    'WRITE_FAILED',
  ]);

  return {
    success: false,
    error: allowedCodes.has(error?.code) ? error.message : fallback,
  };
}

async function runExclusiveOperation(name, operation) {
  if (activeOperation) {
    const error = new Error(`A ${activeOperation} operation is already in progress.`);
    error.code = 'OPERATION_IN_PROGRESS';
    throw error;
  }

  activeOperation = name;
  try {
    return await operation();
  } finally {
    activeOperation = null;
  }
}

function confirmOperationInterruption(parentWindow) {
  const options = {
    type: 'warning',
    buttons: ['Keep working', 'Quit and interrupt'],
    defaultId: 0,
    cancelId: 0,
    title: 'Podax is still working',
    message: `A ${activeOperation} operation is still in progress.`,
    detail:
      'Interrupting it will discard the incomplete output. Podax will clean private staging data the next time it starts.',
  };
  return parentWindow
    ? dialog.showMessageBoxSync(parentWindow, options)
    : dialog.showMessageBoxSync(options);
}

function registerIpcHandlers() {
  registerHandler('dialog:choose-file', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose a file to encrypt',
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  registerHandler('dialog:choose-folder', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose a folder to encrypt',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  registerHandler('dialog:choose-encrypted-file', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose a Podax encrypted file',
      properties: ['openFile'],
      filters: [
        { name: 'Podax encrypted files', extensions: ['podax'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  registerHandler('path:validate', async (_event, sourcePath) => {
    if (typeof sourcePath !== 'string' || sourcePath.length > MAX_PATH_LENGTH) {
      return { type: 'invalid' };
    }
    return validateSourcePath(sourcePath);
  });

  registerHandler('crypto:encrypt', async (_event, request) => {
    try {
      const location = await runExclusiveOperation('encryption', () =>
        encryptPath({
          sourcePath: assertRendererPath(request?.sourcePath),
          password: request?.password,
          outputDirectory: outputDirectory(),
        }),
      );
      return { success: true, location };
    } catch (error) {
      return publicFailure(error, 'Encryption failed before the output was completed.');
    }
  });

  registerHandler('crypto:decrypt', async (_event, request) => {
    try {
      const location = await runExclusiveOperation('decryption', () =>
        decryptFile({
          encryptedPath: assertRendererPath(request?.encryptedPath),
          password: request?.password,
          outputDirectory: outputDirectory(),
        }),
      );
      return { success: true, location };
    } catch (error) {
      return publicFailure(error, 'Decryption failed. Check the file and password.');
    }
  });
}

function registerApplicationProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'bundle' || request.method !== 'GET') {
        return new Response('Not found', { status: 404 });
      }

      const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const resolvedPath = path.resolve(RENDERER_DIRECTORY, `.${requestedPath}`);
      const rendererPrefix = `${RENDERER_DIRECTORY}${path.sep}`;
      if (resolvedPath !== RENDERER_DIRECTORY && !resolvedPath.startsWith(rendererPrefix)) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(resolvedPath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function configureSessionSecurity() {
  const applicationSession = session.defaultSession;
  applicationSession.setPermissionCheckHandler(() => false);
  applicationSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  if (!DEVELOPMENT_SERVER_URL) {
    applicationSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }),
    );
  }
}

function configureApplicationMenu() {
  const template =
    process.platform === 'darwin'
      ? [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]
      : [{ role: 'fileMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const isSmokeTest = process.env.PODAX_SMOKE_TEST === '1';
  const requestedWidth = Number.parseInt(process.env.PODAX_SMOKE_WIDTH || '', 10);
  const requestedHeight = Number.parseInt(process.env.PODAX_SMOKE_HEIGHT || '', 10);
  const window = new BrowserWindow({
    width: isSmokeTest && Number.isFinite(requestedWidth) ? requestedWidth : 800,
    height: isSmokeTest && Number.isFinite(requestedHeight) ? requestedHeight : 760,
    minWidth: 360,
    minHeight: 520,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    backgroundColor: '#f7f8fa',
    title: 'Podax',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  window.on('close', (event) => {
    if (!activeOperation || allowApplicationExit) {
      return;
    }

    event.preventDefault();
    if (confirmOperationInterruption(window) === 1) {
      allowApplicationExit = true;
      app.quit();
    }
  });
  window.once('ready-to-show', () => window.show());

  if (isSmokeTest) {
    const smokeTimeout = setTimeout(() => app.exit(1), 20_000);
    window.webContents.once('did-fail-load', () => {
      clearTimeout(smokeTimeout);
      app.exit(1);
    });
    window.webContents.once('did-finish-load', async () => {
      try {
        await window.webContents.executeJavaScript(`
          new Promise((resolve, reject) => {
            const deadline = Date.now() + 10000;
            const check = () => {
              const heading = document.querySelector('h1');
              const expected = ${JSON.stringify(
                process.env.PODAX_SMOKE_HEADING || 'Private encryption',
              )};
              if (heading && heading.textContent.includes(expected)) {
                const api = window.podax;
                const requiredMethods = [
                  'chooseFile',
                  'chooseFolder',
                  'chooseEncryptedFile',
                  'validatePath',
                  'encrypt',
                  'decrypt',
                ];
                if (!api || !requiredMethods.every((name) => typeof api[name] === 'function')) {
                  reject(new Error('Desktop bridge is unavailable'));
                  return;
                }
                api.validatePath('').then((result) => {
                  if (result && result.type === 'invalid') {
                    resolve(true);
                  } else {
                    reject(new Error('Desktop bridge returned an invalid smoke response'));
                  }
                }, reject);
              } else if (Date.now() >= deadline) {
                reject(new Error('Renderer did not become ready'));
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          })
        `);
        if (process.env.PODAX_SMOKE_SCREENSHOT) {
          const image = await window.webContents.capturePage();
          await fs.writeFile(process.env.PODAX_SMOKE_SCREENSHOT, image.toPNG());
        }
        clearTimeout(smokeTimeout);
        app.exit(0);
      } catch {
        clearTimeout(smokeTimeout);
        app.exit(1);
      }
    });
  }

  const smokeHash = isSmokeTest ? process.env.PODAX_SMOKE_HASH || '' : '';
  if (DEVELOPMENT_SERVER_URL) {
    await window.loadURL(`${DEVELOPMENT_SERVER_URL}${smokeHash}`);
    if (process.env.PODAX_OPEN_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    await window.loadURL(`${APP_ORIGIN}/index.html${smokeHash}`);
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  } else if (app.isReady()) {
    createWindow().catch(reportStartupFailure);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (!activeOperation || allowApplicationExit) {
    return;
  }

  if (confirmOperationInterruption() === 0) {
    event.preventDefault();
  } else {
    allowApplicationExit = true;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(reportStartupFailure);
  }
});

function reportStartupFailure() {
  dialog.showErrorBox(
    'Podax could not start',
    'The application could not load its protected interface. Reinstall Podax and try again.',
  );
  app.exit(1);
}

app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId('io.podax.desktop');
    registerApplicationProtocol();
    configureSessionSecurity();
    configureApplicationMenu();
    registerIpcHandlers();
    await cleanupAbandonedStaging(outputDirectory()).catch(() => {});
    await createWindow();
  })
  .catch(reportStartupFailure);
