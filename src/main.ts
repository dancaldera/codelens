import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from "electron";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { exec, execFile } from 'child_process';
import * as util from 'util';
import { analyzeCodeFromImages, CodeAnalysisResult } from './codeAnalyzer';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Store the mainWindow reference in module scope for the keyboard handlers
let mainWindowRef: BrowserWindow | null = null;

// State for storing captured screenshots
let screenshotBuffers: Buffer[] = [];
let screenshotPaths: string[] = [];

function createWindow(): void {
  // Clear any previous references
  mainWindowRef = null;
  let mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false, // Often used for overlay-type windows
    opacity: 0.6, // Slightly more opaque for better readability
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // Will be compiled to dist/src/preload.js
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
  mainWindow.loadFile(path.join(__dirname, "../../index.html"));

  mainWindow.on("closed", () => {
    // @ts-ignore - Electron will set this to null, which is correct behavior
    mainWindow = null;
    mainWindowRef = null;
  });
  
  // Store reference to mainWindow in the module scope for keyboard handlers
  mainWindowRef = mainWindow;
  
  // Position the window at the left-up border with more padding
  mainWindow.setPosition(50, 50);
  
  // Register global shortcuts that work even when the app is not focused
  registerGlobalShortcuts(mainWindow);
  
  // Enable DevTools in development mode only if DEVTOOLS environment variable is explicitly set to true
  const showDevTools = process.env.DEVTOOLS === 'true';
  if (showDevTools) {
    // Open DevTools with detached mode
    try {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
      console.log('DevTools enabled');
    } catch (error) {
      console.error('Error opening DevTools:', error);
    }
  } else {
    console.log('DevTools disabled - set DEVTOOLS=true to enable');
  }
  
  // Log when the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
  });
  
  // Add error handling for DevTools protocol errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Page failed to load: ${errorDescription} (${errorCode})`);
  });
  
  // Catch DevTools protocol errors
  mainWindow.webContents.session.webRequest.onErrorOccurred(
    { urls: ['*://*/*'] },
    (details) => {
      if (details.error && details.error.includes('net::ERR_FAILED')) {
        console.warn('Intercepted network error (possibly related to DevTools Protocol):', 
          details.error, 'URL:', details.url);
      }
    }
  );
}

app.whenReady().then(createWindow);

// Function to register global shortcuts
function registerGlobalShortcuts(window: BrowserWindow): void {
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
  
  // Register Command+Enter to trigger analysis
  globalShortcut.register('CommandOrControl+Enter', () => {
    if (!window) return;
    console.log('Command+Enter pressed, triggering analysis');
    console.log('Current screenshot paths:', screenshotPaths);
    
    // Show loading indicator
    window.webContents.send('show-loading');
    window.webContents.send('screenshot-status', 'Analyzing screenshots...');
    
    // Directly call analyzeScreenshots instead of sending a message
    // This avoids potential IPC message flow issues
    analyzeScreenshots();
  });
}

// Unregister all shortcuts when quitting
function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}

// Function to save buffer to temp file and open it
async function saveAndOpenScreenshot(buffer: Buffer, index: number): Promise<string | null> {
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
function openScreenshotInPreview(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Screenshot file not found:', filePath);
    return;
  }
  
  // Use the 'open' command to open the file with the default application (Preview on macOS)
  exec(`open "${filePath}"`, (error) => {
    if (error) {
      console.error('Error opening screenshot:', error);
    } else {
      console.log('Opened screenshot in Preview');
    }
  });
}

// Function to capture screenshot in the main process
async function captureScreenshot(): Promise<string | null> {
  if (!mainWindowRef) {
    console.error('No window reference available for screenshot');
    return null;
  }
  
  console.log('Starting screenshot capture in main process');
  
  try {
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
    
    // Wait to ensure the window is fully hidden
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create a temporary file path for the screenshot
    const tempDir = path.join(os.tmpdir(), 'vci-screenshots');
    
    // Ensure the directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const tempFilePath = path.join(tempDir, `macos-screenshot-${timestamp}.png`);
    
    // Use macOS native screencapture command
    const execFilePromise = util.promisify(execFile);
    
    console.log(`Attempting to capture screen to: ${tempFilePath}`);
    
    try {
      // Use the native macOS screencapture command to take a full screenshot
      // -x: no sound, -T: no thumbnail dialog
      await execFilePromise('/usr/sbin/screencapture', ['-x', '-T', '0', tempFilePath]);
      console.log('Native macOS screen capture completed');
    } catch (error) {
      console.error('Error during macOS screen capture:', error);
      throw error;
    }
    
    // Restore window visibility, position and always-on-top state
    if (wasVisible) {
      if (wasAlwaysOnTop) {
        mainWindowRef.setAlwaysOnTop(true, "floating");
      }
      mainWindowRef.setPosition(windowPosition[0], windowPosition[1]);
      mainWindowRef.show();
      mainWindowRef.focus();
    }
    
    // Check if file exists and read it
    if (fs.existsSync(tempFilePath)) {
      const stats = fs.statSync(tempFilePath);
      console.log(`Screenshot file size: ${stats.size} bytes`);
      
      if (stats.size < 1000) {
        console.error('Screenshot file is suspiciously small:', stats.size, 'bytes');
        throw new Error('Screenshot file is too small, may be corrupted');
      }
      
      const buffer = fs.readFileSync(tempFilePath);
      console.log(`Read screenshot file, buffer size: ${buffer.length} bytes`);
      
      // Return as base64 string
      return buffer.toString('base64');
    } else {
      console.error('Screenshot file was not created at expected path:', tempFilePath);
      throw new Error('Screenshot file was not created');
    }
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Make sure the window is restored even after error
    if (mainWindowRef && !mainWindowRef.isVisible()) {
      mainWindowRef.show();
      mainWindowRef.focus();
    }
    
    // Show error dialog to the user
    if (mainWindowRef) {
      dialog.showMessageBox(mainWindowRef, {
        type: 'error',
        title: 'Screenshot Error',
        message: 'Failed to capture screenshot',
        detail: error instanceof Error ? error.toString() : String(error)
      });
    }
    
    return null;
  }
}

// Function to handle the entire screenshot capture and processing flow
async function captureAndProcessScreenshot(): Promise<void> {
  if (!mainWindowRef) {
    console.error('No window reference for screenshot');
    return;
  }
  
  try {
    // Permission dialog removed - screenshot will be taken without asking
    
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
    if (mainWindowRef) {
      mainWindowRef.webContents.send('screenshot-status', 'Error capturing screenshot');
    }
  }
}

// Stub: analyze screenshots (replace with OpenAI Vision integration)
async function analyzeScreenshots(): Promise<void> {
  if (!mainWindowRef) {
    console.error('No window reference for analysis');
    return;
  }
  
  try {
    mainWindowRef.webContents.send('screenshot-status', 'Analyzing screenshots...');
    
    // Check if we have screenshot paths
    if (screenshotPaths.length < 1) {
      console.error('No screenshot paths available for analysis');
      mainWindowRef.webContents.send('analysis-result', 'Error: No screenshots available for analysis');
      return;
    }
    
    console.log('Screenshot paths available for analysis:', screenshotPaths);
    
    // Get the prompt from the renderer if available
    const prompt = await new Promise<string>((resolve) => {
      mainWindowRef?.webContents.send('get-prompt');
      
      // Set up a one-time listener for the prompt response
      ipcMain.once('prompt-response', (event, promptText: string) => {
        console.log('Received prompt response:', promptText);
        resolve(promptText || 'Analyze the images and solve the coding problem in them');
      });
      
      // Set a timeout in case the renderer doesn't respond
      setTimeout(() => {
        console.log('Prompt response timeout, using default prompt');
        resolve('Analyze the images and solve the coding problem in them');
      }, 500);
    });
    
    console.log('About to call analyzeCodeFromImages with paths:', screenshotPaths);
    
    // Analyze the screenshots using the new codeAnalyzer module
    const result = await analyzeCodeFromImages(screenshotPaths, prompt);
    
    console.log('Analysis complete, result:', result);
    
    // Format the analysis result for display
    const formattedResult = formatAnalysisResult(result);
    
    // Send the result to the renderer
    mainWindowRef.webContents.send('analysis-result', formattedResult);
    mainWindowRef.webContents.send('screenshot-status', 'Analysis complete');
  } catch (error) {
    console.error('Error in screenshot analysis:', error);
    if (mainWindowRef) {
      mainWindowRef.webContents.send('analysis-result', `Error analyzing screenshots: ${error instanceof Error ? error.message : String(error)}`);
      mainWindowRef.webContents.send('screenshot-status', 'Analysis failed');
    }
  }
}

// Handle prompt submission from renderer
ipcMain.on('submit-prompt', (event, prompt: string) => {
  if (!mainWindowRef) return;
  console.log('User prompt submitted:', prompt);
  console.log('Current screenshot paths:', screenshotPaths);
  
  // If we have screenshots, analyze them with the provided prompt
  if (screenshotPaths.length > 0) {
    console.log('Screenshots available, triggering analysis');
    mainWindowRef.webContents.send('screenshot-status', 'Analyzing screenshots...');
    analyzeScreenshots();
  } else {
    console.log('No screenshots available, cannot analyze');
    // Just echo the prompt back if no screenshots
    mainWindowRef.webContents.send('submit-result', `Prompt received: ${prompt}`);
  }
});

// New handler for getting the prompt from the renderer
ipcMain.on('prompt-response', (event, prompt: string) => {
  console.log('Prompt response received:', prompt);
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
ipcMain.on('keyboard-event', (event, data: any) => {
  // This is now handled by global shortcuts
});

// Format the analysis result for display
function formatAnalysisResult(result: CodeAnalysisResult): string {
  return `
# Code Analysis

## Language
${result.language}

## Code
\`\`\`${result.language.toLowerCase()}
${result.code}
\`\`\`

## Summary
${result.summary}

## Time Complexity
${result.timeComplexity}

## Space Complexity
${result.spaceComplexity}
`;
}

// Handle screenshot requests from renderer
ipcMain.on('request-screenshot', async () => {
  console.log('Screenshot requested from renderer');
  captureAndProcessScreenshot();
});

// Handle open screenshot request from renderer
ipcMain.on('open-screenshot', (event, index: number) => {
  console.log(`Request to open screenshot ${index}`);
  const filePath = screenshotPaths[index-1];
  if (filePath) {
    openScreenshotInPreview(filePath);
  } else {
    console.error(`No file path for screenshot ${index}`);
  }
});