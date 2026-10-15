import * as path from 'node:path'
import { type App, BrowserWindow } from 'electron'
import { OVERLAY_MIN_HEIGHT, OVERLAY_MIN_WIDTH } from '../ipc'
import type { Logger } from '../lib'

export interface OverlayWindowOptions {
	app: App
	logger: Logger
	preloadPath: string
	indexPath: string
}

export function createOverlayWindow({ app, logger, preloadPath, indexPath }: OverlayWindowOptions): BrowserWindow {
	const window = new BrowserWindow({
		width: 1400,
		height: 2000,
		minWidth: OVERLAY_MIN_WIDTH,
		minHeight: OVERLAY_MIN_HEIGHT,
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
			sandbox: false,
			preload: preloadPath,
		},
	})

	disableAutomaticBoundsAdjustment(window)
	configureOverlayBehavior(window, app, logger)

	loadRendererPage(window, indexPath, 'index.html')
	window.setPosition(50, 50, false)

	return window
}

function disableAutomaticBoundsAdjustment(window: BrowserWindow): void {
	if (!window.setBounds) return

	const originalSetBounds = window.setBounds.bind(window)
	window.setBounds = (bounds, _animate) => originalSetBounds(bounds, false)
}

function configureOverlayBehavior(window: BrowserWindow, app: App, logger: Logger): void {
	window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
	window.setAlwaysOnTop(true, 'floating')
	window.setFullScreenable(false)
	window.moveTop()
	window.setIgnoreMouseEvents(true)

	if (process.platform === 'darwin') {
		window.setWindowButtonVisibility(false)
		try {
			window.setContentProtection(true)
		} catch (error) {
			logger.warn('Failed to set content protection', { error })
		}
	}

	if (process.platform === 'darwin' && app.dock) {
		app.dock.hide()
	}
}

export function loadRendererPage(window: BrowserWindow, filePath: string, page: string): Promise<void> {
	const devServerUrl = process.env.ELECTRON_RENDERER_URL
	return devServerUrl ? window.loadURL(`${devServerUrl}/${page}`) : window.loadFile(filePath)
}

export function resolveRendererPaths(mainDir: string): {
	preloadPath: string
	indexPath: string
	settingsIndexPath: string
} {
	return {
		preloadPath: path.join(mainDir, '..', 'preload', 'preload.js'),
		indexPath: path.join(mainDir, '..', 'renderer', 'index.html'),
		settingsIndexPath: path.join(mainDir, '..', 'renderer', 'settings.html'),
	}
}
