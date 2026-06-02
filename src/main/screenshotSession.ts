import { execFile } from 'node:child_process'
import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as util from 'node:util'
import { type BrowserWindow, desktopCapturer } from 'electron'
import { IPC_CHANNELS } from '../ipc'

const MAX_SCREENSHOTS = 2
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'codelens-screenshots')

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

	constructor(private readonly options: ScreenshotSessionOptions) {}

	get paths(): string[] {
		return [...this.screenshotPaths]
	}

	async capture(): Promise<void> {
		const window = this.options.getWindow()
		if (!window) return

		const wasVisible = window.isVisible()
		try {
			if (wasVisible) window.hide()
			await new Promise((resolve) => setTimeout(resolve, 300))

			let success = await this.captureWithDesktopCapturer()
			if (!success && process.platform === 'darwin') {
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
			if (wasVisible) this.options.getWindow()?.show()
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
			const sources = await desktopCapturer.getSources({
				types: ['window', 'screen'],
				thumbnailSize: { width: 1920, height: 1080 },
			})

			this.options.logger.debug('Desktop sources found', { count: sources.length })

			const source =
				sources.find(
					(s) =>
						!s.name.toLowerCase().includes('electron') &&
						!s.name.toLowerCase().includes('visual-context') &&
						!s.name.toLowerCase().includes('vca') &&
						s.name !== '' &&
						s.name !== 'Unknown',
				) || sources[0]

			if (!source) return false

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
