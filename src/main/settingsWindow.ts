import { BrowserWindow } from 'electron'
import type { Logger } from '../lib'

export interface SettingsWindowPaths {
	preloadPath: string
	settingsIndexPath: string
}

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow({ preloadPath, settingsIndexPath }: SettingsWindowPaths, logger: Logger): void {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.focus()
		return
	}

	settingsWindow = new BrowserWindow({
		width: 440,
		height: 560,
		resizable: false,
		show: false,
		title: 'CodeLens Settings',
		autoHideMenuBar: true,
		alwaysOnTop: true,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: preloadPath,
		},
	})

	void settingsWindow.loadFile(settingsIndexPath).catch((error) => {
		logger.error('Failed to load settings window', {
			error: error instanceof Error ? error.message : String(error),
		})
	})
	settingsWindow.once('ready-to-show', () => settingsWindow?.show())
	settingsWindow.on('closed', () => {
		settingsWindow = null
	})
}
