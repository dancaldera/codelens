import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as util from 'node:util'
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from 'electron'
import { analyzeCodeFromImages } from './codeAnalyzer'
import { createLogger, suppressElectronErrors } from './logger'

const logger = createLogger('Main')

// Suppress common Electron console errors
suppressElectronErrors()

let mainWindow: BrowserWindow | null = null
let screenshotCount = 0
let screenshotPaths: string[] = []
const MAX_SCREENSHOTS = 8

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 500,
		height: 200,
		minWidth: 450,
		minHeight: 180,
		frame: false,
		opacity: 0.7,
		alwaysOnTop: true,
		transparent: true,
		resizable: true,
		movable: true,
		enableLargerThanScreen: true,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, 'preload.js'),
		},
	})

	// Disable automatic bounds adjustment - critical for unlimited movement
	if (mainWindow.setBounds) {
		const originalSetBounds = mainWindow.setBounds.bind(mainWindow)
		mainWindow.setBounds = (bounds, _animate) => {
			// Call original setBounds without any bounds checking
			return originalSetBounds(bounds, false)
		}
	}

	// Make the window visible on all workspaces and screens
	mainWindow.setVisibleOnAllWorkspaces(true, {
		visibleOnFullScreen: true,
	})

	// Set the always on top level - this ensures it stays above everything
	mainWindow.setAlwaysOnTop(true, 'floating')

	// Prevent fullscreen mode to keep it working across spaces
	mainWindow.setFullScreenable(false)

	// Move to top Z-order
	mainWindow.moveTop()

	// Make window click-through (ignores mouse events)
	mainWindow.setIgnoreMouseEvents(true)

	mainWindow.loadFile(path.join(__dirname, '../../index.html'))
	// Set initial position without bounds checking
	mainWindow.setPosition(50, 50, false)

	// Hide from dock on macOS
	if (process.platform === 'darwin' && app.dock) {
		app.dock.hide()
	}

	// Register shortcuts
	registerShortcuts()

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

function registerShortcuts(): void {
	// Screenshot shortcut
	globalShortcut.register('CommandOrControl+H', takeScreenshot)

	// Reset screenshots shortcut
	globalShortcut.register('CommandOrControl+G', () => {
		if (!mainWindow) return
		screenshotCount = 0
		screenshotPaths = []
		mainWindow.webContents.send('clear-screenshots')
		mainWindow.webContents.send('context-reset')
		mainWindow.webContents.send('screenshot-status', 'Screenshots cleared')
		// Window position is preserved - no automatic repositioning
		logger.info('Screenshots reset')
	})

	// Quit shortcut
	globalShortcut.register('CommandOrControl+Q', () => app.quit())

	// Hide/show shortcut
	globalShortcut.register('CommandOrControl+B', () => {
		if (!mainWindow) return
		if (mainWindow.isVisible()) {
			mainWindow.hide()
		} else {
			mainWindow.show()
		}
	})


	// Move window with command+arrow keys - unlimited movement across screens
	const moveDistance = 50

	globalShortcut.register('CommandOrControl+Up', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newY = y - moveDistance
		mainWindow.setPosition(x, newY, false) // false = don't animate, allows negative coordinates
		logger.debug('Window moved up', { x, y: newY })
	})

	globalShortcut.register('CommandOrControl+Down', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newY = y + moveDistance
		mainWindow.setPosition(x, newY, false) // false = don't animate, allows beyond screen bounds
		logger.debug('Window moved down', { x, y: newY })
	})

	globalShortcut.register('CommandOrControl+Left', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newX = x - moveDistance
		mainWindow.setPosition(newX, y, false) // false = don't animate, allows negative coordinates
		logger.debug('Window moved left', { x: newX, y })
	})

	globalShortcut.register('CommandOrControl+Right', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newX = x + moveDistance
		mainWindow.setPosition(newX, y, false) // false = don't animate, allows beyond screen bounds
		logger.debug('Window moved right', { x: newX, y })
	})

	// Fast movement shortcuts (Shift+Cmd+Arrow for larger steps)
	const fastMoveDistance = 200

	globalShortcut.register('Shift+CommandOrControl+Up', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newY = y - fastMoveDistance
		mainWindow.setPosition(x, newY, false)
		logger.debug('Window moved up fast', { x, y: newY })
	})

	globalShortcut.register('Shift+CommandOrControl+Down', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newY = y + fastMoveDistance
		mainWindow.setPosition(x, newY, false)
		logger.debug('Window moved down fast', { x, y: newY })
	})

	globalShortcut.register('Shift+CommandOrControl+Left', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newX = x - fastMoveDistance
		mainWindow.setPosition(newX, y, false)
		logger.debug('Window moved left fast', { x: newX, y })
	})

	globalShortcut.register('Shift+CommandOrControl+Right', () => {
		if (!mainWindow) return
		const [x, y] = mainWindow.getPosition()
		const newX = x + fastMoveDistance
		mainWindow.setPosition(newX, y, false)
		logger.debug('Window moved right fast', { x: newX, y })
	})

}

async function takeScreenshot(): Promise<void> {
	if (!mainWindow) return

	try {
		// Hide window temporarily
		const wasVisible = mainWindow.isVisible()
		if (wasVisible) mainWindow.hide()

		// Wait a moment
		await new Promise((resolve) => setTimeout(resolve, 300))

		let success = false

		// Try desktopCapturer first (for individual windows)
		try {
			const sources = await desktopCapturer.getSources({
				types: ['window', 'screen'],
				thumbnailSize: { width: 1920, height: 1080 },
			})

			logger.debug('Desktop sources found', { count: sources.length })

			// Find the first non-electron window
			const source =
				sources.find(
					(s) =>
						!s.name.toLowerCase().includes('electron') &&
						!s.name.toLowerCase().includes('visual-context') &&
						!s.name.toLowerCase().includes('vca') &&
						s.name !== '' &&
						s.name !== 'Unknown',
				) || sources[0]

			if (source) {
				const buffer = source.thumbnail.toPNG()
				if (buffer.length > 1000) {
					await saveScreenshot(buffer, 'desktopCapturer')
					success = true
				}
			}
		} catch (desktopError) {
			logger.warn('desktopCapturer failed', {
				error: desktopError instanceof Error ? desktopError.message : String(desktopError),
			})
		}

		// Fallback to macOS screencapture if desktopCapturer failed
		if (!success && process.platform === 'darwin') {
			try {
				logger.info('Using fallback screencapture method')
				const tempDir = path.join(os.tmpdir(), 'screenshots')
				if (!fs.existsSync(tempDir)) {
					fs.mkdirSync(tempDir, { recursive: true })
				}

				const timestamp = Date.now()
				const filePath = path.join(tempDir, `fallback-screenshot-${timestamp}.png`)

				const execFilePromise = util.promisify(execFile)
				await execFilePromise('/usr/sbin/screencapture', ['-x', '-T', '0', filePath])

				if (fs.existsSync(filePath)) {
					const buffer = fs.readFileSync(filePath)
					await saveScreenshot(buffer, 'screencapture')
					success = true
				}
			} catch (fallbackError) {
				logger.error('Fallback screencapture failed', {
					error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
				})
			}
		}

		if (!success) {
			logger.error('All screenshot methods failed')
			if (mainWindow) {
				mainWindow.webContents.send('screenshot-status', 'Screenshot failed')
			}
		}

		// Restore window
		if (wasVisible && mainWindow) {
			mainWindow.show()
		}
	} catch (error) {
		logger.error('Screenshot operation failed', {
			error: error instanceof Error ? error.message : String(error),
		})
		if (mainWindow) {
			mainWindow.show()
		}
	}
}

async function saveScreenshot(buffer: Buffer, method: string): Promise<void> {
	const tempDir = path.join(os.tmpdir(), 'screenshots')
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true })
	}

	// Increment screenshot count and cycle through 1-8
	screenshotCount = screenshotCount >= MAX_SCREENSHOTS ? 1 : screenshotCount + 1

	const timestamp = Date.now()
	const filePath = path.join(tempDir, `screenshot-${screenshotCount}-${timestamp}.png`)
	fs.writeFileSync(filePath, buffer)

	// Store screenshot path for analysis - replace at the current index for cycling
	if (screenshotPaths.length < MAX_SCREENSHOTS) {
		// Still filling up the array
		screenshotPaths.push(filePath)
	} else {
		// Array is full, replace at the current index (screenshotCount - 1)
		screenshotPaths[screenshotCount - 1] = filePath
	}

	logger.info('Screenshot saved', {
		screenshotCount,
		method,
		filePath,
		fileSize: buffer.length,
	})

	if (mainWindow) {
		// Send screenshot-image event that the UI expects
		mainWindow.webContents.send('screenshot-image', {
			index: screenshotCount,
			path: filePath,
			data: buffer.toString('base64'),
		})

		// Send status update
		mainWindow.webContents.send('screenshot-status', `Screenshot ${screenshotCount} captured`)
	}
}

// Handle missing IPC handlers to prevent errors
ipcMain.handle('get-api-key', () => {
	return process.env.OPENAI_API_KEY || ''
})

// Handle window resizing
ipcMain.on('resize-window', (_event, { width, height }) => {
	if (!mainWindow) return
	mainWindow.setSize(Math.round(width), Math.round(height))
	logger.info('Window resized', { width, height })
})

// Handle prompt submission for analysis
ipcMain.on('submit-prompt', async (_event, prompt: string) => {
	if (!mainWindow) return

	logger.info('Analysis requested', {
		prompt,
		screenshotCount: screenshotPaths.length,
	})

	if (screenshotPaths.length === 0) {
		mainWindow.webContents.send(
			'analysis-result',
			'No screenshots available for analysis. Please take screenshots first.',
		)
		return
	}

	try {
		// Show loading in UI
		mainWindow.webContents.send('show-loading')

		// Get the prompt from renderer
		mainWindow.webContents.send('get-prompt')

		// Wait for prompt response (handled below)
	} catch (error) {
		logger.error('Error starting analysis', {
			error: error instanceof Error ? error.message : String(error),
		})
		mainWindow.webContents.send('analysis-result', 'Analysis failed to start. Please try again.')
	}
})

// Handle prompt response from renderer
ipcMain.on('prompt-response', async (_event, prompt: string) => {
	if (!mainWindow) return

	try {
		logger.info('Starting code analysis', {
			prompt: prompt.substring(0, 100),
			imageCount: screenshotPaths.length,
		})

		// Perform analysis with language detection callback
		const result = await analyzeCodeFromImages(screenshotPaths, prompt, undefined, (detectedLanguage) => {
			if (mainWindow) {
				mainWindow.webContents.send('language-detected', detectedLanguage)
				logger.info('Language detected', { language: detectedLanguage })
			}
		})

		// Format result as markdown
		const markdownResult = `
## Code
\`\`\`${result.language.toLowerCase()}
${result.code}
\`\`\`

## Summary
${result.summary}

## Complexity Analysis
- **Time Complexity:** ${result.timeComplexity}
- **Space Complexity:** ${result.spaceComplexity}
- **Language:** ${result.language}`

		// Send result to renderer
		mainWindow.webContents.send('analysis-result', markdownResult)
		mainWindow.webContents.send('screenshot-status', 'Analysis completed')

		logger.info('Analysis completed successfully')
	} catch (error) {
		logger.error('Analysis failed', {
			error: error instanceof Error ? error.message : String(error),
		})

		const errorMessage = `# Analysis Failed

An error occurred during code analysis: ${error instanceof Error ? error.message : 'Unknown error'}

Please try again or check your OpenAI API key configuration.`

		mainWindow.webContents.send('analysis-result', errorMessage)
		mainWindow.webContents.send('screenshot-status', 'Analysis failed')
	}
})

// App events
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
	globalShortcut.unregisterAll()
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow()
	}
})

app.on('will-quit', () => {
	globalShortcut.unregisterAll()
})
