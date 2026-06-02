import * as path from 'node:path'
import { type App, BrowserWindow } from 'electron'

interface WindowLogger {
	warn: (message: string, meta?: Record<string, unknown>) => void
}

export interface OverlayWindowOptions {
	app: App
	logger: WindowLogger
	preloadPath: string
	indexPath: string
}

export function createOverlayWindow({ app, logger, preloadPath, indexPath }: OverlayWindowOptions): BrowserWindow {
	const window = new BrowserWindow({
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
			sandbox: false,
			preload: preloadPath,
		},
	})

	disableAutomaticBoundsAdjustment(window)
	configureOverlayBehavior(window, app, logger)

	window.loadFile(indexPath)
	window.setPosition(50, 50, false)

	return window
}

function disableAutomaticBoundsAdjustment(window: BrowserWindow): void {
	if (!window.setBounds) return

	const originalSetBounds = window.setBounds.bind(window)
	window.setBounds = (bounds, _animate) => originalSetBounds(bounds, false)
}

function configureOverlayBehavior(window: BrowserWindow, app: App, logger: WindowLogger): void {
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

export function resolveRendererPaths(distDir: string): { preloadPath: string; indexPath: string } {
	return {
		preloadPath: path.join(distDir, 'preload.js'),
		indexPath: path.join(distDir, '..', '..', 'index.html'),
	}
}
