import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as util from 'node:util'
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from 'electron'
import { createLogger, suppressElectronErrors } from './lib'
import { analyzeContentFromImages, analyzeGeneralContentFromImages } from './services'
import {
	getAvailableModels,
	getAvailableModelsSync,
	getCurrentProvider,
	getProviderInfo,
	isAnyProviderConfigured,
	type Provider,
} from './services/providers'

type AnalysisMode = 'code' | 'general'

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
let previousCodeAnalysis: string | null = null
let previousGeneralAnalysis: string | null = null
const MAX_SCREENSHOTS = 2
let currentOpacity = 0.8
let currentModelIndex = 0 // Current model index for cycling
let availableModels: string[] = []
let currentProvider: Provider = 'openrouter'
let currentMode: AnalysisMode = 'code'
let isAnalysisRunning = false
let pendingAnalysis = false
let analysisPromise: Promise<void> | null = null
let analysisTimer: NodeJS.Timeout | null = null

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
		mainWindow?.webContents.send('analysis-mode-changed', currentMode)
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

async function initializeProvider(): Promise<void> {
	currentProvider = getCurrentProvider()

	// Use sync version first for immediate availability, then fetch async
	availableModels = getAvailableModelsSync(currentProvider)
	currentModelIndex = 0

	logger.info('Provider initialized (sync)', {
		provider: currentProvider,
		models: availableModels,
		defaultModel: availableModels[0],
	})

	// Fetch latest models from API in background
	try {
		const latestModels = await getAvailableModels(currentProvider)
		if (latestModels.length > 0) {
			availableModels = latestModels
			logger.info('Models updated from API', {
				provider: currentProvider,
				models: availableModels,
				count: availableModels.length,
			})

			// Send updated model state to renderer
			if (mainWindow) {
				const modelInfo = {
					provider: currentProvider,
					model: availableModels[currentModelIndex],
				}
				mainWindow.webContents.send('model-changed', modelInfo)
			}
		}
	} catch (error) {
		logger.error('Failed to fetch latest models, using fallback', { error })
	}
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

function toggleAnalysisMode(): void {
	cancelScheduledAnalysis()
	currentMode = currentMode === 'code' ? 'general' : 'code'
	const modeLabel = currentMode === 'code' ? 'Code analysis mode' : 'General analysis mode'

	logger.info('Analysis mode toggled', { mode: currentMode })

	if (mainWindow) {
		mainWindow.webContents.send('screenshot-status', modeLabel)
		mainWindow.webContents.send('analysis-mode-changed', currentMode)
	}

	// Don't auto-trigger analysis on mode switch
	// User can manually trigger with Cmd+Enter if desired
}

function scheduleAnalysis(delay = 0): void {
	if (analysisTimer) {
		clearTimeout(analysisTimer)
	}

	analysisTimer = setTimeout(() => {
		analysisTimer = null
		if (!mainWindow || screenshotPaths.length === 0) {
			return
		}
		mainWindow.webContents.send('show-loading')
		void triggerAnalysis().catch((error) => {
			logger.error('Scheduled analysis failed', {
				error: error instanceof Error ? error.message : String(error),
			})
		})
	}, delay)
}

function cancelScheduledAnalysis(): void {
	if (analysisTimer) {
		clearTimeout(analysisTimer)
		analysisTimer = null
	}
	pendingAnalysis = false
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
		cancelScheduledAnalysis()
		const pathsToRemove = [...screenshotPaths]
		screenshotCount = 0
		screenshotPaths = []
		previousCodeAnalysis = null
		previousGeneralAnalysis = null
		mainWindow.webContents.send('clear-screenshots')
		mainWindow.webContents.send('context-reset')
		mainWindow.webContents.send('screenshot-status', 'Screenshots cleared')
		// Reset window position to initial coordinates
		mainWindow.setPosition(50, 50, false)
		logger.info('Screenshots reset and window repositioned')
		for (const filePath of pathsToRemove) {
			void fsPromises.unlink(filePath).catch(() => {})
		}
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

	// Manual analysis trigger shortcut
	globalShortcut.register('CommandOrControl+Enter', () => {
		if (!mainWindow) return

		if (screenshotPaths.length === 0) {
			mainWindow.webContents.send('screenshot-status', 'No screenshots available for analysis')
			return
		}

		cancelScheduledAnalysis()
		mainWindow.webContents.send('show-loading')
		void triggerAnalysis().catch((error) => {
			logger.error('Manual analysis shortcut failed', {
				error: error instanceof Error ? error.message : String(error),
			})
		})
	})

	// Toggle analysis mode shortcut
	globalShortcut.register('Shift+CommandOrControl+A', () => {
		toggleAnalysisMode()
	})
	globalShortcut.register('CommandOrControl+A', () => {
		toggleAnalysisMode()
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
				await fsPromises.mkdir(tempDir, { recursive: true })

				const timestamp = Date.now()
				const filePath = path.join(tempDir, `fallback-screenshot-${timestamp}.png`)

				const execFilePromise = util.promisify(execFile)
				await execFilePromise('/usr/sbin/screencapture', ['-x', '-T', '0', filePath])

				try {
					const buffer = await fsPromises.readFile(filePath)
					await saveScreenshot(buffer, 'screencapture')
					success = true
				} catch (readError) {
					logger.error('Failed to process fallback screenshot', {
						error: readError instanceof Error ? readError.message : String(readError),
					})
				}
				void fsPromises.unlink(filePath).catch(() => {})
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
	await fsPromises.mkdir(tempDir, { recursive: true })

	const nextSlot = screenshotCount >= MAX_SCREENSHOTS ? 1 : screenshotCount + 1
	const slotIndex = nextSlot - 1
	const timestamp = Date.now()
	const filePath = path.join(tempDir, `screenshot-${nextSlot}-${timestamp}.png`)
	await fsPromises.writeFile(filePath, buffer)

	let previousPath: string | undefined

	// Store screenshot path for analysis - replace at the current index for cycling
	if (screenshotPaths.length < MAX_SCREENSHOTS) {
		if (slotIndex < screenshotPaths.length) {
			previousPath = screenshotPaths[slotIndex]
			screenshotPaths[slotIndex] = filePath
		} else {
			screenshotPaths.push(filePath)
		}
	} else {
		previousPath = screenshotPaths[slotIndex]
		screenshotPaths[slotIndex] = filePath
	}

	screenshotCount = nextSlot

	if (previousPath && previousPath !== filePath) {
		void fsPromises.unlink(previousPath).catch(() => {})
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
		const hasContext = currentMode === 'code' ? !!previousCodeAnalysis : !!previousGeneralAnalysis
		if (screenshotCount === MAX_SCREENSHOTS || (screenshotCount === 1 && hasContext)) {
			scheduleAnalysis(500)
		}
	}
}

async function triggerAnalysis(): Promise<void> {
	if (!mainWindow || screenshotPaths.length === 0) {
		return
	}

	if (isAnalysisRunning) {
		pendingAnalysis = true
		return analysisPromise ?? Promise.resolve()
	}

	if (!availableModels.length) {
		initializeProvider()
	}

	const currentModel = availableModels[currentModelIndex]

	if (!currentModel) {
		logger.warn('No model available for analysis', {
			modelIndex: currentModelIndex,
			models: availableModels,
		})
		return
	}

	const prompt = undefined
	isAnalysisRunning = true
	pendingAnalysis = false

	const currentPromise = (async () => {
		try {
			const hasPrevious = currentMode === 'code' ? !!previousCodeAnalysis : !!previousGeneralAnalysis
			logger.info('Starting analysis', {
				imageCount: screenshotPaths.length,
				hasPreviousAnalysis: hasPrevious,
				mode: currentMode,
				model: currentModel,
				provider: currentProvider,
			})

			let markdownResult = ''

			if (currentMode === 'code') {
				const result = await analyzeContentFromImages(
					screenshotPaths,
					prompt,
					'code',
					previousCodeAnalysis || undefined,
					(detectedLanguage) => {
						if (mainWindow) {
							mainWindow.webContents.send('language-detected', detectedLanguage)
							logger.info('Language detected', { language: detectedLanguage })
						}
					},
					currentModel,
					currentProvider,
				)

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

					previousCodeAnalysis = JSON.stringify({
						code: result.code,
						summary: result.summary,
						timeComplexity: result.timeComplexity,
						spaceComplexity: result.spaceComplexity,
						language: result.language,
					})
				} else {
					markdownResult = '## Error\nUnexpected result format'
					previousCodeAnalysis = null
				}
			} else {
				const result = await analyzeGeneralContentFromImages(
					screenshotPaths,
					prompt,
					previousGeneralAnalysis || undefined,
					currentModel,
					currentProvider,
				)

				markdownResult = `
## Solution
${result.answer}

## Analysis
${result.explanation}

## Test Plan
${result.test}`

				previousGeneralAnalysis = JSON.stringify(result)
			}

			mainWindow?.webContents.send('analysis-result', markdownResult)
			mainWindow?.webContents.send('screenshot-status', 'Analysis completed')

			logger.info('Analysis completed successfully', { mode: currentMode })
		} catch (error) {
			logger.error('Analysis failed', {
				error: error instanceof Error ? error.message : String(error),
			})

			const failureContext = currentMode === 'code' ? 'code analysis' : 'general analysis'
			const errorMessage = `# Analysis Failed

An error occurred during ${failureContext}: ${error instanceof Error ? error.message : 'Unknown error'}

Please try again or check your OpenAI API key configuration.`

			mainWindow?.webContents.send('analysis-result', errorMessage)
			mainWindow?.webContents.send('screenshot-status', 'Analysis failed')
		} finally {
			isAnalysisRunning = false
			analysisPromise = null

			if (pendingAnalysis && mainWindow && screenshotPaths.length > 0) {
				pendingAnalysis = false
				await triggerAnalysis()
			}
		}
	})()

	analysisPromise = currentPromise
	await currentPromise
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

	cancelScheduledAnalysis()
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
