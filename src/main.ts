import { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFile } from 'child_process';
import * as util from 'util';
import { createLogger, logPerformance } from './logger';

const logger = createLogger('Main');

let mainWindow: BrowserWindow | null = null;
let screenshotCount = 0;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    opacity: 0.7,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // Make the window visible on all workspaces and screens
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Set the always on top level - this ensures it stays above everything
  mainWindow.setAlwaysOnTop(true, "floating");

  // Prevent fullscreen mode to keep it working across spaces
  mainWindow.setFullScreenable(false);

  // Move to top Z-order
  mainWindow.moveTop();

  mainWindow.loadFile(path.join(__dirname, "../../index.html"));
  mainWindow.setPosition(50, 50);

  // Hide from dock on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  // Register shortcuts
  registerShortcuts();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerShortcuts(): void {
  // Screenshot shortcut
  globalShortcut.register('CommandOrControl+H', takeScreenshot);
  
  // Reset screenshots shortcut
  globalShortcut.register('CommandOrControl+G', () => {
    if (!mainWindow) return;
    screenshotCount = 0;
    mainWindow.webContents.send('clear-screenshots');
    mainWindow.webContents.send('screenshot-status', 'Screenshots cleared');
    logger.info('Screenshots reset');
  });

  // Quit shortcut
  globalShortcut.register('CommandOrControl+Q', () => app.quit());

  // Hide/show shortcut
  globalShortcut.register('CommandOrControl+B', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

async function takeScreenshot(): Promise<void> {
  if (!mainWindow) return;

  try {
    // Hide window temporarily
    const wasVisible = mainWindow.isVisible();
    if (wasVisible) mainWindow.hide();

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 300));

    let success = false;

    // Try desktopCapturer first (for individual windows)
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      logger.debug('Desktop sources found', { count: sources.length });

      // Find the first non-electron window
      const source = sources.find(s => 
        !s.name.toLowerCase().includes('electron') && 
        !s.name.toLowerCase().includes('visual-context') &&
        !s.name.toLowerCase().includes('vca') &&
        s.name !== '' && 
        s.name !== 'Unknown'
      ) || sources[0];

      if (source) {
        const buffer = source.thumbnail.toPNG();
        if (buffer.length > 1000) {
          await saveScreenshot(buffer, 'desktopCapturer');
          success = true;
        }
      }
    } catch (desktopError) {
      logger.warn('desktopCapturer failed', { 
        error: desktopError instanceof Error ? desktopError.message : String(desktopError) 
      });
    }

    // Fallback to macOS screencapture if desktopCapturer failed
    if (!success && process.platform === 'darwin') {
      try {
        logger.info('Using fallback screencapture method');
        const tempDir = path.join(os.tmpdir(), 'screenshots');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filePath = path.join(tempDir, `fallback-screenshot-${timestamp}.png`);

        const execFilePromise = util.promisify(execFile);
        await execFilePromise('/usr/sbin/screencapture', ['-x', '-T', '0', filePath]);

        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          await saveScreenshot(buffer, 'screencapture');
          success = true;
        }
      } catch (fallbackError) {
        logger.error('Fallback screencapture failed', { 
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) 
        });
      }
    }

    if (!success) {
      logger.error('All screenshot methods failed');
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-status', 'Screenshot failed');
      }
    }

    // Restore window
    if (wasVisible && mainWindow) {
      mainWindow.show();
    }

  } catch (error) {
    logger.error('Screenshot operation failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    if (mainWindow) {
      mainWindow.show();
    }
  }
}

async function saveScreenshot(buffer: Buffer, method: string): Promise<void> {
  const tempDir = path.join(os.tmpdir(), 'screenshots');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Increment screenshot count and reset after 2
  screenshotCount = screenshotCount >= 2 ? 1 : screenshotCount + 1;
  
  const timestamp = Date.now();
  const filePath = path.join(tempDir, `screenshot-${screenshotCount}-${timestamp}.png`);
  fs.writeFileSync(filePath, buffer);
  
  logger.info('Screenshot saved', { 
    screenshotCount, 
    method, 
    filePath, 
    fileSize: buffer.length 
  });
  
  if (mainWindow) {
    // Send screenshot-image event that the UI expects
    mainWindow.webContents.send('screenshot-image', {
      index: screenshotCount,
      path: filePath,
      data: buffer.toString('base64')
    });
    
    // Send status update
    mainWindow.webContents.send('screenshot-status', `Screenshot ${screenshotCount} captured`);
  }
}

// Handle missing IPC handlers to prevent errors
ipcMain.handle('get-api-key', () => {
  return process.env.OPENAI_API_KEY || '';
});

// App events
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
