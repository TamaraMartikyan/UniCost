const { app, BrowserWindow } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let backendProcess;

function installODBCIfNeeded() {
  try {
    const odbcPath = path.join(process.resourcesPath, 'odbc', 'msodbcsql.msi');
    if (fs.existsSync(odbcPath)) {
      execSync(`msiexec /i "${odbcPath}" /quiet /norestart IACCEPTMSODBCSQLLICENSETERMS=YES`, 
        { timeout: 120000 });
    }
  } catch (e) {
  }
}

function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http.get('http://127.0.0.1:8001/health', (res) => {
        if (res.statusCode === 200) resolve();
        else retry(n);
      }).on('error', () => retry(n));
    };
    const retry = (n) => {
      if (n <= 0) reject('Backend did not start');
      else setTimeout(() => check(n - 1), 500);
    };
    check(retries);
  });
}

function startBackend() {
  const isPackaged = app.isPackaged;
  const backendPath = isPackaged
    ? path.join(process.resourcesPath, 'backend', 'main.exe')
    : path.join(__dirname, '../../dist/main.exe');
  backendProcess = spawn(backendPath, [], { stdio: 'ignore', detached: false });
}

function createWindow() {
  const win = new BrowserWindow({ 
    width: 1280, 
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      webSecurity: false
    }
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(async () => {
  installODBCIfNeeded();
  startBackend();
  await waitForBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});