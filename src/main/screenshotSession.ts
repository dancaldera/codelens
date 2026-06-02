import { execFile } from 'node:child_process'
import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as util from 'node:util'
import { type BrowserWindow, desktopCapturer, screen } from 'electron'
import { IPC_CHANNELS } from '../ipc'

const MAX_SCREENSHOTS = 2
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'codelens-screenshots')
const HIDE_TIMEOUT_MS = 250
const HIDE_SETTLE_MS = 150
const DEFAULT_CAPTURE_SIZE = { width: 1920, height: 1080 }

interface ScreenshotLogger {
	debug: (message: string, meta?: Record<string, unknown>) => void
	info: (message: string, meta?: Record<string, unknown>) => void
	warn: (message: string, meta?: Record<string, unknown>) => void
	error: (message: string, meta?: Record<string, unknown>) => void
}

export interface ScreenshotSessionOptions {
	getWindow: () => BrowserWindow | null
	hasContext: () => boolean
	onShouldAnalyze: () => void
	logger: ScreenshotLogger
}

export class ScreenshotSession {
	private screenshotCount = 0
	private screenshotPaths: string[] = []
	private isCapturing = false

	constructor(private readonly options: ScreenshotSessionOptions) {}

	get paths(): string[] {
		return [...this.screenshotPaths]
	}

	async capture(): Promise<void> {
		const window = this.options.getWindow()
		if (!window) return

		if (this.isCapturing) {
			this.options.logger.warn('Screenshot capture already in progress')
			window.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Screenshot already in progress')
			return
		}

		this.isCapturing = true
		const wasVisible = window.isVisible()
		this.options.logger.info('Starting screenshot capture', {
			wasVisible,
			bounds: typeof window.getBounds === 'function' ? window.getBounds() : undefined,
		})

		try {
			if (wasVisible) {
				window.hide()
				await this.waitForWindowHidden(window)
			}
			await this.delay(HIDE_SETTLE_MS)

			let success = false
			const useScreencaptureFirst =
				process.platform === 'darwin' && process.env.CODELENS_SCREENSHOT_METHOD === 'screencapture'

			if (useScreencaptureFirst) {
				success = await this.captureWithScreencapture()
			}
			if (!success) {
				success = await this.captureWithDesktopCapturer()
			}
			if (!success && process.platform === 'darwin' && !useScreencaptureFirst) {
				success = await this.captureWithScreencapture()
			}

			if (!success) {
				this.options.logger.error('All screenshot methods failed')
				this.options.getWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Screenshot failed')
			}
		} catch (error) {
			this.options.logger.error('Screenshot operation failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			this.options.getWindow()?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, 'Screenshot failed')
		} finally {
			this.isCapturing = false
			if (wasVisible) {
				this.options.getWindow()?.show()
				this.options.logger.debug('Overlay restored after screenshot')
			}
		}
	}

	async save(buffer: Buffer, method: string): Promise<void> {
		await fsPromises.mkdir(SCREENSHOT_DIR, { recursive: true })

		const nextSlot = this.screenshotCount >= MAX_SCREENSHOTS ? 1 : this.screenshotCount + 1
		const slotIndex = nextSlot - 1
		const filePath = path.join(SCREENSHOT_DIR, `screenshot-${nextSlot}-${Date.now()}.png`)
		await fsPromises.writeFile(filePath, buffer)

		const previousPath = this.screenshotPaths[slotIndex]
		this.screenshotPaths[slotIndex] = filePath
		this.screenshotCount = nextSlot

		if (previousPath && previousPath !== filePath) {
			await this.deleteFile(previousPath, 'Failed to delete old screenshot file')
		}

		this.options.logger.info('Screenshot saved', {
			screenshotCount: this.screenshotCount,
			method,
			filePath,
			fileSize: buffer.length,
		})

		const window = this.options.getWindow()
		window?.webContents.send(IPC_CHANNELS.SCREENSHOT_IMAGE, {
			index: this.screenshotCount,
			path: filePath,
			data: buffer.toString('base64'),
		})
		window?.webContents.send(IPC_CHANNELS.SCREENSHOT_STATUS, `Screenshot ${this.screenshotCount} captured`)

		if (this.shouldAnalyzeAfterSave()) {
			this.options.onShouldAnalyze()
		}
	}

	async reset(): Promise<void> {
		const pathsToRemove = this.clearState()
		await Promise.all(pathsToRemove.map((filePath) => this.deleteFile(filePath, 'Failed to delete screenshot file')))
	}

	clearState(): string[] {
		const pathsToRemove = [...this.screenshotPaths]
		this.screenshotCount = 0
		this.screenshotPaths = []
		return pathsToRemove
	}

	async cleanupSessionFiles(): Promise<void> {
		await this.reset()
	}

	async cleanupStaleFiles(): Promise<void> {
		try {
			const entries = await fsPromises.readdir(SCREENSHOT_DIR)
			await Promise.all(
				entries
					.filter((entry) => /^screenshot-\d+-\d+\.png$/.test(entry) || /^fallback-screenshot-\d+\.png$/.test(entry))
					.map((entry) => this.deleteFile(path.join(SCREENSHOT_DIR, entry), 'Failed to delete stale screenshot file')),
			)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				this.options.logger.warn('Failed to clean stale screenshots', { error })
			}
		}
	}

	getPath(index: number): string | undefined {
		return this.screenshotPaths[index - 1]
	}

	private shouldAnalyzeAfterSave(): boolean {
		return this.screenshotCount === MAX_SCREENSHOTS || (this.screenshotCount === 1 && this.options.hasContext())
	}

	private async captureWithDesktopCapturer(): Promise<boolean> {
		try {
			const targetDisplay = this.getTargetDisplay()
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: targetDisplay?.size ?? DEFAULT_CAPTURE_SIZE,
			})

			this.options.logger.debug('Desktop sources found', { count: sources.length, targetDisplayId: targetDisplay?.id })

			const source = this.selectDesktopSource(sources, targetDisplay?.id)
			if (!source) return false

			this.options.logger.info('Selected desktop capture source', {
				id: source.id,
				name: source.name,
				displayId: source.display_id,
			})

			const buffer = source.thumbnail.toPNG()
			if (buffer.length <= 1000) return false

			await this.save(buffer, 'desktopCapturer')
			return true
		} catch (error) {
			this.options.logger.warn('desktopCapturer failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			return false
		}
	}

	private selectDesktopSource(
		sources: Awaited<ReturnType<typeof desktopCapturer.getSources>>,
		targetDisplayId?: number,
	): Awaited<ReturnType<typeof desktopCapturer.getSources>>[number] | undefined {
		const screenSources = sources.filter((source) => source.id.startsWith('screen:'))
		const targetScreen = screenSources.find((source) => source.display_id === String(targetDisplayId))
		if (targetScreen) return targetScreen
		if (screenSources[0]) return screenSources[0]

		return sources.find((source) => this.isCaptureableWindowSource(source)) || sources[0]
	}

	private isCaptureableWindowSource(source: Awaited<ReturnType<typeof desktopCapturer.getSources>>[number]): boolean {
		const name = source.name.toLowerCase()
		return (
			!name.includes('electron') &&
			!name.includes('codelens') &&
			!name.includes('visual-context') &&
			!name.includes('vca') &&
			source.name !== '' &&
			source.name !== 'Unknown'
		)
	}

	private getTargetDisplay(): { id: number; size: { width: number; height: number } } | null {
		const window = this.options.getWindow()
		try {
			if (window && typeof window.getBounds === 'function') {
				const display = screen.getDisplayMatching(window.getBounds())
				return { id: display.id, size: this.getScaledDisplaySize(display) }
			}

			const display = screen.getPrimaryDisplay()
			return { id: display.id, size: this.getScaledDisplaySize(display) }
		} catch (error) {
			this.options.logger.warn('Failed to resolve target display for screenshot', { error })
			return null
		}
	}

	private getScaledDisplaySize(display: Electron.Display): { width: number; height: number } {
		return {
			width: Math.round(display.size.width * display.scaleFactor),
			height: Math.round(display.size.height * display.scaleFactor),
		}
	}

	private async waitForWindowHidden(window: BrowserWindow): Promise<void> {
		if (!window.isVisible()) return

		await new Promise<void>((resolve) => {
			const timeout = setTimeout(resolve, HIDE_TIMEOUT_MS)
			window.once('hide', () => {
				clearTimeout(timeout)
				resolve()
			})
		})
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	private async captureWithScreencapture(): Promise<boolean> {
		try {
			this.options.logger.info('Using fallback screencapture method')
			await fsPromises.mkdir(SCREENSHOT_DIR, { recursive: true })

			const filePath = path.join(SCREENSHOT_DIR, `fallback-screenshot-${Date.now()}.png`)
			const execFilePromise = util.promisify(execFile)
			await execFilePromise('/usr/sbin/screencapture', ['-x', '-T', '0', filePath])

			try {
				const buffer = await fsPromises.readFile(filePath)
				await this.save(buffer, 'screencapture')
				return true
			} finally {
				await this.deleteFile(filePath, 'Failed to delete temporary screenshot file')
			}
		} catch (error) {
			this.options.logger.error('Fallback screencapture failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			return false
		}
	}

	private async deleteFile(filePath: string, message: string): Promise<void> {
		try {
			await fsPromises.unlink(filePath)
		} catch (error) {
			this.options.logger.warn(message, { filePath, error })
		}
	}
}

export const screenshotDirectory = SCREENSHOT_DIR
export const maxScreenshots = MAX_SCREENSHOTS
