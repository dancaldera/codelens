import { BrowserWindow } from 'electron'
import type { Logger } from '../lib'
import { loadRendererPage } from './window'

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
		frame: false,
		transparent: true,
		autoHideMenuBar: true,
		alwaysOnTop: true,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: preloadPath,
		},
	})

	void loadRendererPage(settingsWindow, settingsIndexPath, 'settings.html').catch((error) => {
		logger.error('Failed to load settings window', {
			error: error instanceof Error ? error.message : String(error),
		})
	})
	settingsWindow.once('ready-to-show', () => settingsWindow?.show())
	settingsWindow.on('closed', () => {
		settingsWindow = null
	})
}
