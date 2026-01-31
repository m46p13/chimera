import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Configure logging
  autoUpdater.logger = console;
  
  // Auto-download in background - no UI during download
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // Events
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater:status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    // Download starts automatically since autoDownload = true
    // Just notify that download is starting
    mainWindow.webContents.send('updater:status', { 
      status: 'downloading', 
      version: info.version,
      percent: 0
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:status', { 
      status: 'downloading', 
      percent: progress.percent 
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:status', { 
      status: 'ready', 
      version: info.version 
    });
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater:status', { 
      status: 'error', 
      error: err.message 
    });
  });

  // IPC handlers
  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall());

  // Check for updates on startup (after 10 seconds)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}
