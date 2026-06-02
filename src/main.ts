import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from './ipc'
import { createLogger, suppressElectronErrors } from './lib'
import { AnalysisSession } from './main/analysisSession'
import { loadEnvironment } from './main/env'
import { registerIpcHandlers } from './main/ipcHandlers'
import { ScreenshotSession } from './main/screenshotSession'
import { registerShortcuts } from './main/shortcuts'
import { createOverlayWindow, resolveRendererPaths } from './main/window'

const logger = createLogger('Main')

suppressElectronErrors()

let mainWindow: BrowserWindow | null = null
let screenshotSession: ScreenshotSession | null = null
let analysisSession: AnalysisSession | null = null
let currentOpacity = 0.8
let analysisTimer: NodeJS.Timeout | null = null
let isQuitting = false

function createWindow(): void {
	const rendererPaths = resolveRendererPaths(__dirname)
	mainWindow = createOverlayWindow({ app, logger, ...rendererPaths })

	screenshotSession = new ScreenshotSession({
		getWindow: () => mainWindow,
		hasContext: () => analysisSession?.hasPreviousAnalysis() ?? false,
		onShouldAnalyze: () => scheduleAnalysis(500),
		logger,
	})

	analysisSession = new AnalysisSession({
		getWindow: () => mainWindow,
		getImagePaths: () => screenshotSession?.paths ?? [],
		logger,
	})

	void screenshotSession.cleanupStaleFiles()
	registerApplicationShortcuts()
	registerApplicationIpcHandlers()

	mainWindow.webContents.once('dom-ready', () => {
		updateOpacity()
		void analysisSession?.initializeProvider()
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

function registerApplicationShortcuts(): void {
	if (!screenshotSession || !analysisSession) return

	globalShortcut.unregisterAll()
	registerShortcuts({
		globalShortcut,
		getWindow: () => mainWindow,
		screenshotSession,
		analysisSession,
		scheduleAnalysis,
		cancelScheduledAnalysis,
		onReset: resetSession,
		onQuit: () => app.quit(),
		increaseOpacity,
		decreaseOpacity,
		logger,
	})
}

function registerApplicationIpcHandlers(): void {
	if (!screenshotSession || !analysisSession) return

	registerIpcHandlers({
		ipcMain,
		shell,
		getWindow: () => mainWindow,
		screenshotSession,
		analysisSession,
		cancelScheduledAnalysis,
		logger,
	})
}

async function resetSession(): Promise<void> {
	if (!mainWindow || !screenshotSession || !analysisSession) return

	cancelScheduledAnalysis()
	analysisSession.resetContext()
	await screenshotSession.reset()

	mainWindow.webContents.send(IPC_CHANNELS.CLEAR_SCREENSHOTS)
	mainWindow.webContents.send(IPC_CHANNELS.CONTEXT_RESET)
	mainWindow.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Screenshots cleared')
	mainWindow.setPosition(50, 50, false)
	logger.info('Screenshots reset and window repositioned')
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

function scheduleAnalysis(delay = 0): void {
	if (analysisTimer) {
		clearTimeout(analysisTimer)
	}

	analysisTimer = setTimeout(() => {
		analysisTimer = null
		if (!mainWindow || !analysisSession || !screenshotSession?.paths.length) return

		mainWindow.webContents.send(IPC_CHANNELS.SHOW_LOADING)
		void analysisSession.triggerAnalysis().catch((error) => {
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
}

app.whenReady().then(async () => {
	await loadEnvironment(app, logger)
	createWindow()
})

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

app.on('before-quit', (event) => {
	if (isQuitting) return

	event.preventDefault()
	isQuitting = true
	globalShortcut.unregisterAll()
	const cleanup = screenshotSession?.cleanupSessionFiles() ?? Promise.resolve()
	void cleanup.finally(() => app.quit())
})

app.on('will-quit', () => {
	globalShortcut.unregisterAll()
})
