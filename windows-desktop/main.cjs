const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const WEB_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.resolve(__dirname, '..', 'dist');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.task': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

let mainWindow;
let localServer;
let appOrigin;

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(message);
}

function serveWebAsset(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, appOrigin).pathname);
  } catch {
    sendText(response, 400, 'Invalid path');
    return;
  }

  const assetPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(WEB_ROOT, assetPath);
  const relativePath = path.relative(WEB_ROOT, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, fileStats) => {
    if (statError || !fileStats.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': fileStats.size,
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

async function startLocalServer() {
  localServer = http.createServer(serveWebAsset);
  await new Promise((resolve, reject) => {
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => {
      localServer.removeListener('error', reject);
      resolve();
    });
  });

  appOrigin = `http://127.0.0.1:${localServer.address().port}`;
  return appOrigin;
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let requestingOrigin = '';
    try {
      requestingOrigin = new URL(details.requestingUrl).origin;
    } catch {
      callback(false);
      return;
    }

    const requestsVideo = details.mediaTypes?.includes('video');
    callback(permission === 'media' && requestingOrigin === appOrigin && requestsVideo);
  });
}

function configureDownloads() {
  session.defaultSession.on('will-download', async (event, item, webContents) => {
    let requestingOrigin = '';
    try {
      requestingOrigin = new URL(webContents.getURL()).origin;
    } catch {
      event.preventDefault();
      return;
    }

    if (requestingOrigin !== appOrigin) {
      event.preventDefault();
      return;
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('pictures'), item.getFilename()),
      title: 'Save image',
    });
    if (result.canceled || !result.filePath) {
      item.cancel();
      return;
    }
    item.setSavePath(result.filePath);
  });
}

async function createWindow() {
  const startUrl = await startLocalServer();
  configurePermissions();
  configureDownloads();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#07101d',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, destination) => {
    if (new URL(destination).origin !== appOrigin) event.preventDefault();
  });
  await mainWindow.loadURL(startUrl);
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('IQRA Gesture Lab could not start', error.message);
  app.quit();
});

app.on('before-quit', () => {
  localServer?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
