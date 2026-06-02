import type { BrowserWindow, GlobalShortcut } from 'electron'
import { IPC_CHANNELS } from '../ipc'
import type { AnalysisSession } from './analysisSession'
import type { ScreenshotSession } from './screenshotSession'
import type { VoiceSession } from './voiceSession'

interface ShortcutLogger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface RegisterShortcutsOptions {
	globalShortcut: GlobalShortcut
	getWindow: () => BrowserWindow | null
	screenshotSession: ScreenshotSession
	analysisSession: AnalysisSession
	voiceSession: VoiceSession
	scheduleAnalysis: (delay?: number, allowSingleScreenshot?: boolean) => void
	cancelScheduledAnalysis: () => void
	onReset: () => Promise<void>
	onQuit: () => void
	increaseOpacity: () => void
	decreaseOpacity: () => void
	logger: ShortcutLogger
}

export function registerShortcuts(options: RegisterShortcutsOptions): void {
	const register = (accelerator: string, callback: () => void) => {
		const registered = options.globalShortcut.register(accelerator, callback)
		if (!registered) {
			options.logger.warn('Failed to register global shortcut', { accelerator })
		}
	}

	register('CommandOrControl+H', () => {
		void options.screenshotSession.capture()
	})

	register('Shift+CommandOrControl+H', () => {
		const window = options.getWindow()
		if (!window) return
		window.webContents.send(IPC_CHANNELS.TOGGLE_VOICE_RECORDING)
	})

	register('CommandOrControl+G', () => {
		void options.onReset()
	})

	register('CommandOrControl+Q', options.onQuit)

	register('CommandOrControl+B', () => {
		const window = options.getWindow()
		if (!window) return
		if (window.isVisible()) {
			window.hide()
		} else {
			window.show()
		}
	})

	registerMoveShortcuts(options, register)

	register('CommandOrControl+1', options.decreaseOpacity)
	register('CommandOrControl+2', options.increaseOpacity)
	register('CommandOrControl+M', () => options.analysisSession.switchModel())
	register('Shift+CommandOrControl+M', () => options.voiceSession.switchModel())

	register('CommandOrControl+Enter', () => {
		if (!options.getWindow()) return

		options.cancelScheduledAnalysis()
		options.scheduleAnalysis(0, true)
	})
}

function registerMoveShortcuts(
	options: RegisterShortcutsOptions,
	register: (accelerator: string, callback: () => void) => void,
): void {
	const moveDistance = 50
	const fastMoveDistance = 200
	const move = (accelerator: string, deltaX: number, deltaY: number, distance: number) => {
		register(accelerator, () => {
			const window = options.getWindow()
			if (!window) return

			const [x = 0, y = 0] = window.getPosition()
			const newX = x + deltaX * distance
			const newY = y + deltaY * distance
			window.setPosition(newX, newY, false)
			options.logger.debug('Window moved', { accelerator, x: newX, y: newY })
		})
	}

	move('CommandOrControl+Up', 0, -1, moveDistance)
	move('CommandOrControl+Down', 0, 1, moveDistance)
	move('CommandOrControl+Left', -1, 0, moveDistance)
	move('CommandOrControl+Right', 1, 0, moveDistance)
	move('Shift+CommandOrControl+Up', 0, -1, fastMoveDistance)
	move('Shift+CommandOrControl+Down', 0, 1, fastMoveDistance)
	move('Shift+CommandOrControl+Left', -1, 0, fastMoveDistance)
	move('Shift+CommandOrControl+Right', 1, 0, fastMoveDistance)
}
