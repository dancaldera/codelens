const { app, BrowserWindow, ipcMain, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

function createWindow() {
  // Clear any previous references
  mainWindowRef = null;
  let mainWindow = new BrowserWindow({
    width: 450,
    height: 150,
    frame: false, // Often used for overlay-type windows
    opacity: 0.5, // Fixed window opacity at 50%
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Make the window visible on all workspaces, including fullscreen ones
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Set the always on top level - 'floating' or 'screen-saver' are common choices
  mainWindow.setAlwaysOnTop(true, "floating");

  // Prevent the window itself from being fullscreenable
  // This is key for staying above other fullscreen apps on macOS
  mainWindow.setFullScreenable(false);

  // Optional: Hide the app from the Dock if it's just an overlay
  // app.dock.hide();

  // Move the window to the top Z-order (might help in some cases)
  // mainWindow.moveTop();

  // Load your app content
  mainWindow.loadFile(path.join(__dirname, "../index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    mainWindowRef = null;
  });
  
  // Store reference to mainWindow in the module scope for keyboard handlers
  mainWindowRef = mainWindow;
  
  // Position the window at the left-up border with some padding
  mainWindow.setPosition(10, 10);
  
  // Register global shortcuts that work even when the app is not focused
  registerGlobalShortcuts(mainWindow);
}

// Store the mainWindow reference in module scope for the keyboard handlers
let mainWindowRef = null;

app.whenReady().then(createWindow);

// Function to register global shortcuts
function registerGlobalShortcuts(window) {
  // Define move amount for movement shortcuts
  const MOVE_AMOUNT = 25;
  
  // Register Command+Arrow keys for window movement
  globalShortcut.register('CommandOrControl+Up', () => {
    if (!window) return;
    const [x, y] = window.getPosition();
    window.setPosition(x, y - MOVE_AMOUNT);
  });
  
  globalShortcut.register('CommandOrControl+Down', () => {
    if (!window) return;
    const [x, y] = window.getPosition();
    window.setPosition(x, y + MOVE_AMOUNT);
  });
  
  globalShortcut.register('CommandOrControl+Left', () => {
    if (!window) return;
    const [x, y] = window.getPosition();
    window.setPosition(x - MOVE_AMOUNT, y);
  });
  
  globalShortcut.register('CommandOrControl+Right', () => {
    if (!window) return;
    const [x, y] = window.getPosition();
    window.setPosition(x + MOVE_AMOUNT, y);
  });
  
  // Register Command+B for toggling visibility
  globalShortcut.register('CommandOrControl+B', () => {
    if (!window) return;
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });
  
  // Register Command+Q to quit the application
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
  
  // Register Command+H to capture screenshot or reset context
  globalShortcut.register('CommandOrControl+H', () => {
    if (!window) return;
    // ask renderer to capture screenshot
    window.webContents.send('trigger-screenshot');
  });
}

// Unregister all shortcuts when quitting
// Unregister all shortcuts when quitting
function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

// State for storing captured screenshots
let screenshotBuffers = [];

// Handle screenshot data from renderer
ipcMain.on('screenshot-captured', (event, base64Data) => {
  if (!mainWindowRef) return;
  if (!base64Data) {
    mainWindowRef.webContents.send('screenshot-status', 'Error capturing screenshot');
    return;
  }
  const buffer = Buffer.from(base64Data, 'base64');
  screenshotBuffers.push(buffer);
  if (screenshotBuffers.length === 1) {
    mainWindowRef.webContents.send('screenshot-status', 'Captured screenshot 1 of 2');
  } else if (screenshotBuffers.length === 2) {
    mainWindowRef.webContents.send('screenshot-status', 'Captured screenshot 2 of 2. Analyzing...');
    analyzeScreenshots();
  } else {
    // Reset context after two screenshots
    screenshotBuffers = [];
    mainWindowRef.webContents.send('context-reset');
  }
});

// Stub: analyze screenshots (replace with OpenAI Vision integration)
async function analyzeScreenshots() {
  const result = 'Analysis not implemented yet.';
  if (mainWindowRef) {
    mainWindowRef.webContents.send('analysis-result', result);
  }
}

// Handle prompt submission from renderer
ipcMain.on('submit-prompt', (event, prompt) => {
  if (!mainWindowRef) return;
  console.log('User prompt submitted:', prompt);
  // Stub: echo prompt back
  mainWindowRef.webContents.send('submit-result', `Prompt received: ${prompt}`);
});

app.on("window-all-closed", () => {
  // Unregister shortcuts when all windows are closed
  unregisterShortcuts();
  
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up shortcuts when app is about to quit
app.on('will-quit', () => {
  unregisterShortcuts();
});

// We don't need the keyboard events from renderer anymore
// since we're using global shortcuts instead, but keeping
// this handler for backward compatibility in case we add
// more keyboard shortcuts in the future
ipcMain.on('keyboard-event', (event, data) => {
  // This is now handled by global shortcuts
});
