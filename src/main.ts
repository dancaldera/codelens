import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { IPC_CHANNELS, type LoadingStatusPayload } from './ipc'
import { createLogger, suppressElectronErrors } from './lib'
import { AnalysisSession } from './main/analysisSession'
import { loadEnvironment } from './main/env'
import { registerIpcHandlers } from './main/ipcHandlers'
import { ScreenshotSession } from './main/screenshotSession'
import { registerShortcuts } from './main/shortcuts'
import { VoiceSession } from './main/voiceSession'
import { createOverlayWindow, resolveRendererPaths } from './main/window'

const logger = createLogger('Main')

suppressElectronErrors()

let mainWindow: BrowserWindow | null = null
let screenshotSession: ScreenshotSession | null = null
let analysisSession: AnalysisSession | null = null
let voiceSession: VoiceSession | null = null
let currentOpacity = 0.8
let analysisTimer: NodeJS.Timeout | null = null
let isQuitting = false
let pendingAnalysisRequest = false
let pendingSingleScreenshotAnalysis = false

function createWindow(): void {
	const rendererPaths = resolveRendererPaths(__dirname)
	mainWindow = createOverlayWindow({ app, logger, ...rendererPaths })

	screenshotSession = new ScreenshotSession({
		getWindow: () => mainWindow,
		hasContext: () => analysisSession?.hasPreviousAnalysis() ?? false,
		isWaitingForVoice: () => voiceSession?.isVoiceBusy() ?? false,
		onShouldAnalyze: () => scheduleAnalysis(500),
		logger,
	})

	voiceSession = new VoiceSession({
		getWindow: () => mainWindow,
		onVoiceSettled: handleVoiceSettled,
		logger,
	})

	analysisSession = new AnalysisSession({
		getWindow: () => mainWindow,
		getImagePaths: () => screenshotSession?.paths ?? [],
		getVoiceContext: () => voiceSession?.getTranscript(),
		logger,
	})

	void screenshotSession.cleanupStaleFiles()
	registerApplicationShortcuts()
	registerApplicationIpcHandlers()

	mainWindow.webContents.once('dom-ready', () => {
		updateOpacity()
		void analysisSession?.initializeProvider()
		void voiceSession?.initializeModels()
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

function registerApplicationShortcuts(): void {
	if (!screenshotSession || !analysisSession || !voiceSession) return

	globalShortcut.unregisterAll()
	registerShortcuts({
		globalShortcut,
		getWindow: () => mainWindow,
		screenshotSession,
		analysisSession,
		voiceSession,
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
	if (!screenshotSession || !analysisSession || !voiceSession) return

	registerIpcHandlers({
		ipcMain,
		shell,
		getWindow: () => mainWindow,
		screenshotSession,
		analysisSession,
		voiceSession,
		cancelScheduledAnalysis,
		scheduleAnalysis,
		logger,
	})
}

async function resetSession(): Promise<void> {
	if (!mainWindow || !screenshotSession || !analysisSession) return

	cancelScheduledAnalysis()
	analysisSession.resetContext()
	voiceSession?.reset()
	pendingAnalysisRequest = false
	pendingSingleScreenshotAnalysis = false
	await screenshotSession.reset()

	mainWindow.webContents.send(IPC_CHANNELS.CLEAR_SCREENSHOTS)
	mainWindow.webContents.send(IPC_CHANNELS.CONTEXT_RESET)
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

function scheduleAnalysis(delay = 0, allowSingleScreenshot = false): void {
	pendingAnalysisRequest = true
	pendingSingleScreenshotAnalysis = pendingSingleScreenshotAnalysis || allowSingleScreenshot
	if (analysisTimer) {
		clearTimeout(analysisTimer)
	}

	analysisTimer = setTimeout(() => {
		analysisTimer = null
		flushPendingAnalysisRequest()
	}, delay)
}

function flushPendingAnalysisRequest(): void {
	if (!pendingAnalysisRequest || !mainWindow || !analysisSession || !screenshotSession || !voiceSession) return

	if (voiceSession.isVoiceBusy()) {
		// While recording, the top-right card is the sole indicator; only the
		// post-recording transcription needs an in-overlay loading status.
		if (!voiceSession.isRecording()) {
			showLoadingStatus(getWaitingForVoiceStatus())
		}
		return
	}

	if (!canStartAnalysisNow(pendingSingleScreenshotAnalysis)) {
		showLoadingStatus(getWaitingForContextStatus())
		return
	}

	pendingAnalysisRequest = false
	pendingSingleScreenshotAnalysis = false
	showLoadingStatus({
		state: 'analyzing',
		title: 'Analyzing context',
		message: getAnalysisLoadingMessage(),
	})

	void analysisSession.triggerAnalysis().catch((error) => {
		logger.error('Scheduled analysis failed', {
			error: error instanceof Error ? error.message : String(error),
		})
	})
}

function canStartAnalysisNow(allowSingleScreenshot = false): boolean {
	if (!analysisSession || !screenshotSession || !voiceSession || voiceSession.isVoiceBusy()) return false

	const imageCount = screenshotSession.paths.length
	return (
		imageCount >= 2 ||
		voiceSession.hasTranscript() ||
		(imageCount >= 1 && (analysisSession.hasPreviousAnalysis() || allowSingleScreenshot))
	)
}

function getWaitingForVoiceStatus(): LoadingStatusPayload {
	return {
		state: 'transcribing',
		title: 'Preparing voice context',
		message: 'Transcribing your note before starting analysis.',
	}
}

function getWaitingForContextStatus(): LoadingStatusPayload {
	const imageCount = screenshotSession?.paths.length ?? 0
	const remainingScreenshots = Math.max(2 - imageCount, 0)

	return {
		state: 'waiting',
		title: imageCount > 0 ? 'Waiting for more context' : 'Ready when you are',
		message:
			imageCount > 0
				? `${imageCount}/2 screenshots captured. Capture ${remainingScreenshots} more or record a voice note.`
				: 'Capture 2 screenshots or record a voice note to start analysis.',
	}
}

function getAnalysisLoadingMessage(): string {
	const imageCount = screenshotSession?.paths.length ?? 0
	const hasVoice = voiceSession?.hasTranscript() ?? false
	if (imageCount && hasVoice) return 'Combining screenshots with your voice note.'
	if (hasVoice) return 'Using your voice note as the full prompt.'
	return 'Reading screenshots and building the answer.'
}

function showLoadingStatus(status: LoadingStatusPayload): void {
	mainWindow?.webContents.send(IPC_CHANNELS.SHOW_LOADING, status)
}

function hideLoadingStatus(): void {
	mainWindow?.webContents.send(IPC_CHANNELS.HIDE_LOADING)
}

function handleVoiceSettled(): void {
	if (voiceSession?.hasTranscript() || pendingAnalysisRequest || screenshotSession?.paths.length) {
		scheduleAnalysis(250)
		return
	}

	// Audio was transcribed but produced nothing to analyze (no transcript, no
	// screenshots, no queued request) — clear the lingering "Preparing voice
	// context" loader instead of leaving it spinning. The recording card already
	// reports the outcome (e.g. "No speech").
	hideLoadingStatus()
}

function cancelScheduledAnalysis(): void {
	if (analysisTimer) {
		clearTimeout(analysisTimer)
		analysisTimer = null
	}
	pendingAnalysisRequest = false
	pendingSingleScreenshotAnalysis = false
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
	const cleanup = screenshotSession?.reset() ?? Promise.resolve()
	void cleanup.finally(() => app.quit())
})

app.on('will-quit', () => {
	globalShortcut.unregisterAll()
})
