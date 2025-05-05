const { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer, screen, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Enable live reload for all the files inside your project directory
require('electron-reload')(__dirname, {
  // Note: This will work for changes to main.js and other files,
  // but for changes to the main process file itself, the app will still need to be restarted
  electron: path.join(__dirname, '../node_modules', '.bin', 'electron'),
  hardResetMethod: 'exit'
});

function createWindow() {
  // Clear any previous references
  mainWindowRef = null;
  let mainWindow = new BrowserWindow({
    width: 300,
    height: 250,
    frame: false, // Often used for overlay-type windows
    opacity: 0.85, // Slightly more opaque for better readability
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
  
  // Position the window at the left-up border with more padding
  mainWindow.setPosition(50, 50);
  
  // Register global shortcuts that work even when the app is not focused
  registerGlobalShortcuts(mainWindow);
  
  // Enable DevTools in development mode only if DEVTOOLS environment variable is true
  // or if it's not set (default behavior)
  const showDevTools = process.env.DEVTOOLS !== 'false';
  if (showDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    console.log('DevTools enabled');
  } else {
    console.log('DevTools disabled');
  }
  
  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
  });
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
    console.log('Command+H pressed, triggering screenshot');
    captureAndProcessScreenshot();
  });
  
  // Register Command+G to reset context
  globalShortcut.register('CommandOrControl+G', () => {
    if (!window) return;
    console.log('Command+G pressed, resetting context');
    
    // Reset screenshot buffers
    screenshotBuffers = [];
    screenshotPaths = [];
    
    // Notify renderer to reset context
    window.webContents.send('context-reset');
    
    // Clear the images in the renderer
    window.webContents.send('clear-screenshots');
  });
}

// Unregister all shortcuts when quitting
function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

// State for storing captured screenshots
let screenshotBuffers = [];
let screenshotPaths = [];

// Function to save buffer to temp file and open it
async function saveAndOpenScreenshot(buffer, index) {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'vci-screenshots');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate a filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(tempDir, `screenshot-${index}-${timestamp}.png`);
    
    // Write buffer to file
    fs.writeFileSync(filePath, buffer);
    console.log(`Screenshot saved to: ${filePath}`);
    
    // Store the path for later reference
    screenshotPaths[index-1] = filePath;
    
    return filePath;
  } catch (error) {
    console.error('Error saving screenshot:', error);
    return null;
  }
}

// Function to open screenshot in Preview
function openScreenshotInPreview(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Screenshot file not found:', filePath);
    return;
  }
  
  // Use the 'open' command to open the file with the default application (Preview on macOS)
  const { exec } = require('child_process');
  exec(`open "${filePath}"`, (error) => {
    if (error) {
      console.error('Error opening screenshot:', error);
    } else {
      console.log('Opened screenshot in Preview');
    }
  });
}

// Function to capture screenshot in the main process
async function captureScreenshot() {
  if (!mainWindowRef) {
    console.error('No window reference available for screenshot');
    return null;
  }
  
  console.log('Starting screenshot capture in main process');
  
  try {
    // Get the primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    
    console.log(`Screen dimensions: ${width}x${height}`);
    
    // Store current window position, visibility state, and always-on-top state
    const wasVisible = mainWindowRef.isVisible();
    const windowPosition = mainWindowRef.getPosition();
    const wasAlwaysOnTop = mainWindowRef.isAlwaysOnTop();
    
    // Hide the app window to avoid capturing it in the screenshot
    if (wasVisible) {
      // Temporarily disable always-on-top to ensure it doesn't appear in fullscreen apps
      if (wasAlwaysOnTop) {
        mainWindowRef.setAlwaysOnTop(false);
      }
      mainWindowRef.hide();
    }
    
    // Wait longer to ensure the window is fully hidden and screen is updated
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Use the actual screen dimensions for the thumbnail
    const thumbnailSize = {
      width: width,
      height: height
    };
    
    // First try to get just screen sources as they're more reliable
    console.log('Getting screen sources...');
    const screenSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize
    });
    
    // Restore window visibility, position and always-on-top state after capture
    if (wasVisible) {
      if (wasAlwaysOnTop) {
        mainWindowRef.setAlwaysOnTop(true, "floating");
      }
      mainWindowRef.setPosition(windowPosition[0], windowPosition[1]);
      mainWindowRef.show();
      mainWindowRef.focus();
    }
    
    if (!screenSources || screenSources.length === 0) {
      console.error('No screen sources found');
      return null;
    }
    
    console.log(`Found ${screenSources.length} screen sources`);
    
    // Find the primary display source
    let source = null;
    for (const s of screenSources) {
      console.log(`Screen source: ${s.name}, id: ${s.id}`);
      if (s.name.toLowerCase().includes('primary') || 
          s.name.toLowerCase().includes('main') ||
          s.name.toLowerCase().includes('display 1') ||
          s.display_id === primaryDisplay.id.toString()) {
        source = s;
        console.log(`Selected primary screen: ${s.name}`);
        break;
      }
    }
    
    // If no primary screen found, use the first one
    if (!source && screenSources.length > 0) {
      source = screenSources[0];
      console.log(`Using first available screen: ${source.name}`);
    }
    
    if (!source) {
      console.error('No suitable source found for screenshot');
      return null;
    }
    
    if (!source.thumbnail) {
      console.error('No thumbnail available in source');
      return null;
    }
    
    const thumbnailSize2 = source.thumbnail.getSize();
    console.log('Thumbnail size:', thumbnailSize2);
    
    // Check if we got a valid thumbnail
    if (thumbnailSize2.width === 0 || thumbnailSize2.height === 0) {
      console.error('Invalid thumbnail size (0x0)');
      return null;
    }
    
    // Convert to base64 and return
    const pngBuffer = source.thumbnail.toPNG();
    console.log('PNG buffer size:', pngBuffer.length);
    
    if (pngBuffer.length === 0) {
      console.error('Empty PNG buffer');
      return null;
    }
    
    return pngBuffer.toString('base64');
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
  }
}

// Function to handle the entire screenshot capture and processing flow
async function captureAndProcessScreenshot() {
  if (!mainWindowRef) {
    console.error('No window reference for screenshot');
    return;
  }
  
  try {
    // Ask for permission before capturing screenshot
    const { response } = await dialog.showMessageBox(mainWindowRef, {
      type: 'question',
      buttons: ['Cancel', 'Allow'],
      defaultId: 1,
      title: 'Screen Capture Permission',
      message: 'Allow this app to capture your screen?',
      detail: 'This will take a screenshot of your current active window or screen.',
      cancelId: 0,
    });
    
    // If user cancelled, abort the screenshot
    if (response === 0) {
      console.log('Screenshot permission denied by user');
      mainWindowRef.webContents.send('screenshot-status', 'Screenshot cancelled');
      return;
    }
    
    mainWindowRef.webContents.send('screenshot-status', 'Capturing screenshot...');
    
    const base64Data = await captureScreenshot();
    
    if (!base64Data) {
      mainWindowRef.webContents.send('screenshot-status', 'Error capturing screenshot');
      return;
    }
    
    console.log(`Screenshot captured successfully, data length: ${base64Data.length}`);
    
    // Process the screenshot data
    const buffer = Buffer.from(base64Data, 'base64');
    screenshotBuffers.push(buffer);
    
    if (screenshotBuffers.length === 1) {
      // Save screenshot to temp file
      const filePath = await saveAndOpenScreenshot(buffer, 1);
      
      mainWindowRef.webContents.send('screenshot-status', 'Captured screenshot 1 of 2');
      // Send the image data to the renderer for display
      mainWindowRef.webContents.send('screenshot-image', {
        index: 1,
        data: base64Data,
        path: filePath
      });
    } else if (screenshotBuffers.length === 2) {
      // Save screenshot to temp file
      const filePath = await saveAndOpenScreenshot(buffer, 2);
      
      mainWindowRef.webContents.send('screenshot-status', 'Captured screenshot 2 of 2. Analyzing...');
      // Send the image data to the renderer for display
      mainWindowRef.webContents.send('screenshot-image', {
        index: 2,
        data: base64Data,
        path: filePath
      });
      analyzeScreenshots();
    } else {
      // Reset context after two screenshots
      screenshotBuffers = [];
      screenshotPaths = [];
      mainWindowRef.webContents.send('context-reset');
      // Clear the images in the renderer
      mainWindowRef.webContents.send('clear-screenshots');
    }
  } catch (error) {
    console.error('Error in screenshot capture process:', error);
    mainWindowRef.webContents.send('screenshot-status', 'Error capturing screenshot');
  }
}

// Handle screenshot requests from renderer
ipcMain.on('request-screenshot', async (event) => {
  console.log('Screenshot requested from renderer');
  captureAndProcessScreenshot();
});

// Handle open screenshot request from renderer
ipcMain.on('open-screenshot', (event, index) => {
  console.log(`Request to open screenshot ${index}`);
  const filePath = screenshotPaths[index-1];
  if (filePath) {
    openScreenshotInPreview(filePath);
  } else {
    console.error(`No file path for screenshot ${index}`);
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
