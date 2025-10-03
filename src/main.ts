import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as util from 'node:util'
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from 'electron'
import { createLogger, suppressElectronErrors } from './lib'
import { analyzeContentFromImages } from './services'
import {
	getAvailableModels,
	getCurrentProvider,
	getProviderInfo,
	isAnyProviderConfigured,
	type Provider,
} from './services/providers'

// Load environment variables from .env file
try {
	const dotenv = require('dotenv')
	// In packaged app, look for .env in the app's directory and user's home
	const appPath = app.isPackaged ? path.dirname(process.execPath) : process.cwd()
	const homePath = os.homedir()

	// Try multiple locations for .env file
	const envPaths = [
		path.join(appPath, '.env'),
		path.join(homePath, '.env'),
		path.join(process.cwd(), '.env'),
		path.join(__dirname, '..', '..', '.env'),
	]

	let envLoaded = false
	for (const envPath of envPaths) {
		if (fs.existsSync(envPath)) {
			dotenv.config({ path: envPath })
			console.log(`Loaded environment variables from: ${envPath}`)
			envLoaded = true
			break
		}
	}

	if (!envLoaded) {
		console.log('No .env file found, using system environment variables only')
		console.log(`Searched paths: ${envPaths.join(', ')}`)
	}
} catch (error) {
	console.warn('dotenv loading failed:', error)
}

const logger = createLogger('Main')

// Suppress common Electron console errors
suppressElectronErrors()

let mainWindow: BrowserWindow | null = null
let screenshotCount = 0
let screenshotPaths: string[] = []
let previousAnalysis: string | null = null
const MAX_SCREENSHOTS = 2
let currentOpacity = 0.8
let currentModelIndex = 0 // Current model index for cycling
let availableModels: string[] = []
let currentProvider: Provider = 'openrouter'

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 2000,
		minWidth: 600,
		minHeight: 400,
		frame: false,
		opacity: 0.8,
		alwaysOnTop: true,
		transparent: true,
		resizable: true,
		movable: true,
		enableLargerThanScreen: true,
		skipTaskbar: true,
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

	// Additional security: exclude from screen capture and sharing
	if (process.platform === 'darwin') {
		// On macOS, set the window level to prevent screen capture
		mainWindow.setWindowButtonVisibility(false)
		// Set content protection to exclude from screen recordings
		try {
			mainWindow.setContentProtection(true)
		} catch (error) {
			logger.warn('Failed to set content protection', { error })
		}
	}

	mainWindow.loadFile(path.join(__dirname, '../../index.html'))
	// Set initial position without bounds checking
	mainWindow.setPosition(50, 50, false)

	// Hide from dock on macOS
	if (process.platform === 'darwin' && app.dock) {
		app.dock.hide()
	}

	// Register shortcuts
	registerShortcuts()

	// Initialize opacity and model after window loads
	mainWindow.webContents.once('dom-ready', () => {
		updateOpacity()
		// Initialize provider and models
		initializeProvider()
		// Send initial model state to renderer
		const initialState = getInitialModelState()
		mainWindow?.webContents.send('model-changed', initialState)
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

function increaseOpacity(): void {
	if (!mainWindow) return
	currentOpacity = Math.min(currentOpacity + 0.1, 1.0)
	updateOpacity()
}

function decreaseOpacity(): void {
	if (!mainWindow) return
	currentOpacity = Math.max(currentOpacity - 0.1, 0.1)
	updateOpacity()
}

function updateOpacity(): void {
	if (!mainWindow) return
	mainWindow.setOpacity(currentOpacity)
	logger.info('Opacity changed', { opacity: currentOpacity })
}

function initializeProvider(): void {
	currentProvider = getCurrentProvider()
	availableModels = getAvailableModels(currentProvider)
	currentModelIndex = 0

	logger.info('Provider initialized', {
		provider: currentProvider,
		models: availableModels,
		defaultModel: availableModels[0],
	})
}

function switchModel(): void {
	// Check if any provider is configured
	if (!isAnyProviderConfigured()) {
		logger.warn('Attempted to switch model without any provider configured')
		if (mainWindow) {
			mainWindow.webContents.send('screenshot-status', 'No API key configured')
		}
		return
	}

	// Cycle through available models
	currentModelIndex = (currentModelIndex + 1) % availableModels.length
	const currentModel = availableModels[currentModelIndex]

	logger.info('Model switched', {
		provider: currentProvider,
		model: currentModel,
		index: currentModelIndex,
	})

	if (mainWindow) {
		// Send model change to renderer with provider info
		const modelInfo = {
			provider: currentProvider,
			model: currentModel,
		}
		mainWindow.webContents.send('model-changed', modelInfo)
		mainWindow.webContents.send('screenshot-status', `Model: ${currentProvider}:${currentModel}`)
	}
}

function getInitialModelState(): string | { provider: Provider; model: string } {
	// Return appropriate initial state based on provider configuration
	if (!isAnyProviderConfigured()) {
		return 'no-key'
	}

	const providerInfo = getProviderInfo(currentProvider)
	return {
		provider: providerInfo.provider,
		model: availableModels[currentModelIndex],
	}
}

function registerShortcuts(): void {
	// Screenshot shortcut
	globalShortcut.register('CommandOrControl+H', takeScreenshot)

	// Reset screenshots shortcut
	globalShortcut.register('CommandOrControl+G', () => {
		if (!mainWindow) return
		screenshotCount = 0
		screenshotPaths = []
		previousAnalysis = null
		mainWindow.webContents.send('clear-screenshots')
		mainWindow.webContents.send('context-reset')
		mainWindow.webContents.send('screenshot-status', 'Screenshots cleared')
		// Reset window position to initial coordinates
		mainWindow.setPosition(50, 50, false)
		logger.info('Screenshots reset and window repositioned')
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

	// Opacity control shortcuts
	globalShortcut.register('CommandOrControl+1', () => {
		if (!mainWindow) return
		decreaseOpacity()
	})

	globalShortcut.register('CommandOrControl+2', () => {
		if (!mainWindow) return
		increaseOpacity()
	})

	// Model switching shortcut
	globalShortcut.register('CommandOrControl+M', () => {
		switchModel()
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

		// Auto-trigger analysis when we have 2 screenshots or when adding to existing analysis
		if (screenshotCount === 2 || (screenshotCount === 1 && previousAnalysis)) {
			setTimeout(() => {
				if (mainWindow) {
					mainWindow.webContents.send('show-loading')
					triggerAnalysis()
				}
			}, 500)
		}
	}
}

async function triggerAnalysis(): Promise<void> {
	if (!mainWindow || screenshotPaths.length === 0) return

	// Use the enhanced prompts from the analyzer (pass undefined to use defaults)
	const prompt = undefined

	try {
		logger.info('Starting analysis', {
			imageCount: screenshotPaths.length,
			hasPreviousAnalysis: !!previousAnalysis,
		})

		// Get current model
		const currentModel = availableModels[currentModelIndex]

		// Perform analysis with previous context if available
		const result = await analyzeContentFromImages(
			screenshotPaths,
			prompt,
			'code', // Always use code mode
			previousAnalysis || undefined,
			(detectedLanguage) => {
				if (mainWindow) {
					mainWindow.webContents.send('language-detected', detectedLanguage)
					logger.info('Language detected', { language: detectedLanguage })
				}
			},
			currentModel, // Pass the current model
			currentProvider, // Pass the current provider
		)

		// Format result as markdown
		let markdownResult: string

		if ('code' in result) {
			markdownResult = `
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

			// Store this analysis as context for future screenshots
			previousAnalysis = JSON.stringify({
				code: result.code,
				summary: result.summary,
				timeComplexity: result.timeComplexity,
				spaceComplexity: result.spaceComplexity,
				language: result.language,
			})
		} else {
			markdownResult = '## Error\nUnexpected result format'
			previousAnalysis = null
		}

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
}

// Handle window resizing
ipcMain.on('resize-window', (_event, { width, height }) => {
	if (!mainWindow) return
	mainWindow.setSize(Math.round(width), Math.round(height))
	logger.info('Window resized', { width, height })
})

// Handle manual analysis trigger (kept for compatibility)
ipcMain.on('submit-prompt', async (_event, _prompt: string) => {
	if (!mainWindow) return

	if (screenshotPaths.length === 0) {
		mainWindow.webContents.send(
			'analysis-result',
			'No screenshots available for analysis. Please take screenshots first.',
		)
		return
	}

	mainWindow.webContents.send('show-loading')
	await triggerAnalysis()
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
