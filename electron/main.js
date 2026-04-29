const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');

log.transports.file.level = 'info';

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = 8001;
const isDev = !app.isPackaged;

/* ─────────────────────────────────────────────
   ✅ Prevent multiple instances
───────────────────────────────────────────── */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

/* ─────────────────────────────────────────────
   Backend path
───────────────────────────────────────────── */
function getBackendPath() {
    const exe = process.platform === 'win32' ? 'main.exe' : 'main';

    const candidates = [
        path.join(process.resourcesPath, 'backend', exe),
        path.join(path.dirname(app.getPath('exe')), 'resources', 'backend', exe),
        path.join(__dirname, '..', '..', 'backend', exe),
    ];

    for (const p of candidates) {
        log.info('Checking backend path:', p, '→', fs.existsSync(p) ? 'EXISTS' : 'not found');
        if (fs.existsSync(p)) return p;
    }

    log.error('Backend not found');
    return candidates[0];
}

/* ─────────────────────────────────────────────
   Safe port cleanup — kills then waits until free
───────────────────────────────────────────── */
async function killPortIfBusy(port) {
    if (process.platform !== 'win32') return;

    try {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.trim().split('\n');

        for (const line of lines) {
            if (!line.includes('LISTENING')) continue;

            const pid = line.trim().split(/\s+/).pop();

            if (backendProcess && pid == backendProcess.pid) continue;

            if (pid && pid !== '0') {
                log.info(`Killing external process ${pid} on port ${port}`);
                try { execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' }); } catch {}
            }
        }
    } catch {}

    // Poll until the port is actually free (up to 5 s)
    for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        try {
            execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
            // still occupied — keep waiting
        } catch {
            log.info(`Port ${port} is free`);
            return;
        }
    }
    log.warn(`Port ${port} still occupied after 5 s — proceeding anyway`);
}

/* ─────────────────────────────────────────────
   Start backend (SAFE)
───────────────────────────────────────────── */
async function startBackend() {
    if (isDev) return;

    if (backendProcess) {
        log.info("Backend already running");
        return;
    }

    await killPortIfBusy(BACKEND_PORT);

    const backendPath = getBackendPath();
    log.info('Starting backend:', backendPath);

    try {
        const configPath = path.join(app.getPath('userData'), 'unicost_config.json');
        backendProcess = spawn(backendPath, [], {
            env: { ...process.env, PORT: String(BACKEND_PORT), UNICOST_CONFIG_PATH: configPath },
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(backendPath),
        });

        backendProcess.stdout.on('data', d =>
            log.info('Backend:', d.toString().trim())
        );

        backendProcess.stderr.on('data', d =>
            log.warn('Backend stderr:', d.toString().trim())
        );

        backendProcess.on('close', code => {
            log.warn('Backend exited:', code);
            backendProcess = null; // allow restart if needed
        });

        backendProcess.on('error', err => {
            log.error('Failed to start backend:', err);
            dialog.showErrorBox(
                'Backend Error',
                `Failed to start backend:\n${err.message}`
            );
        });

    } catch (err) {
        log.error('Backend spawn error:', err);
    }
}

/* ─────────────────────────────────────────────
   Wait for backend
───────────────────────────────────────────── */
function waitForBackend(retries = 60, delay = 1000) {
    return new Promise((resolve, reject) => {
        const check = (remaining) => {
            if (remaining <= 0) {
                reject(new Error('Backend did not start in time'));
                return;
            }

            const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
                if (res.statusCode === 200) {
                    log.info('Backend ready');
                    resolve();
                } else {
                    setTimeout(() => check(remaining - 1), delay);
                }
            });

            req.on('error', () =>
                setTimeout(() => check(remaining - 1), delay)
            );

            req.end();
        };

        check(retries);
    });
}

/* ─────────────────────────────────────────────
   Create window
───────────────────────────────────────────── */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 600,
        title: 'UniCost',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        show: false,
        backgroundColor: '#0a0a12',
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/* ─────────────────────────────────────────────
   App ready
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   IPC: download URL to temp file and open it
───────────────────────────────────────────── */
ipcMain.handle('open-file-url', async (_event, url, filename = 'export.xlsx') => {
    const ext = path.extname(filename) || '.xlsx';
    const base = path.basename(filename, ext);
    const tmpPath = path.join(os.tmpdir(), `${base}_${Date.now()}${ext}`);

    await new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(tmpPath);
        proto.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            fs.unlink(tmpPath, () => {});
            reject(err);
        });
    });

    const result = await shell.openPath(tmpPath);
    if (result) log.warn('shell.openPath error:', result);
});

app.whenReady().then(async () => {

    createWindow();

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
        return;
    }

    mainWindow.loadFile(path.join(__dirname, 'loading.html'));

    await startBackend();

    try {
        await waitForBackend();

        mainWindow.loadFile(
            path.join(__dirname, '..', 'unicost_final', 'dist', 'index.html')
        );

    } catch (err) {
        log.error('Backend startup failed:', err);

        dialog.showErrorBox(
            'Startup Failed',
            'Backend failed to start. Check logs.'
        );

        mainWindow.loadFile(path.join(__dirname, 'error.html'));
    }
});

/* ─────────────────────────────────────────────
   Quit handling
───────────────────────────────────────────── */
app.on('before-quit', () => {
    log.info("App quitting...");

    if (backendProcess) {
        log.info('Killing backend process...');
        backendProcess.kill();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});