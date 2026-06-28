import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getSources = vi.fn()

vi.mock('electron', () => ({
	desktopCapturer: {
		getSources,
	},
	screen: {
		getDisplayMatching: vi.fn(() => ({ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 })),
		getPrimaryDisplay: vi.fn(() => ({ id: 1, size: { width: 1440, height: 900 }, scaleFactor: 2 })),
	},
}))

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

function createWindowMock(visible = true) {
	let isVisible = visible
	return {
		webContents: { send: vi.fn() },
		isVisible: vi.fn(() => isVisible),
		hide: vi.fn(() => {
			isVisible = false
		}),
		show: vi.fn(() => {
			isVisible = true
		}),
		once: vi.fn((event: string, callback: () => void) => {
			if (event === 'hide') callback()
		}),
		getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
	} as never
}

describe('ScreenshotSession', () => {
	let dateSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		vi.clearAllMocks()
		getSources.mockReset()
		dateSpy = vi.spyOn(Date, 'now')
	})

	afterEach(() => {
		dateSpy.mockRestore()
	})

	test('captures once at a time and restores the overlay', async () => {
		dateSpy.mockReturnValue(1000)
		getSources.mockResolvedValue([
			{
				id: 'screen:1:0',
				name: 'Entire Screen',
				display_id: '1',
				thumbnail: { toPNG: () => Buffer.alloc(1500) },
			},
		])
		const window = createWindowMock()
		const { ScreenshotSession } = await import('../../src/main/screenshotSession')
		const session = new ScreenshotSession({
			getWindow: () => window,
			hasContext: () => false,
			onShouldAnalyze: vi.fn(),
			logger,
		})

		await Promise.all([session.capture(), session.capture()])

		expect(getSources).toHaveBeenCalledTimes(1)
		expect(window.hide).toHaveBeenCalledTimes(1)
		expect(window.show).toHaveBeenCalledTimes(1)
		expect(window.webContents.send).toHaveBeenCalledWith(
			'screenshot-image',
			expect.objectContaining({ index: 1, data: Buffer.alloc(1500).toString('base64') }),
		)

		await session.reset()
	})

	test('prefers screen sources for desktop capture', async () => {
		dateSpy.mockReturnValue(1000)
		getSources.mockResolvedValue([
			{
				id: 'window:1:0',
				name: 'Editor',
				display_id: '',
				thumbnail: { toPNG: () => Buffer.from('wrong-window') },
			},
			{
				id: 'screen:1:0',
				name: 'Entire Screen',
				display_id: '1',
				thumbnail: { toPNG: () => Buffer.alloc(1500) },
			},
		])
		const window = createWindowMock()
		const { ScreenshotSession } = await import('../../src/main/screenshotSession')
		const session = new ScreenshotSession({
			getWindow: () => window,
			hasContext: () => false,
			onShouldAnalyze: vi.fn(),
			logger,
		})

		await session.capture()

		expect(logger.info).toHaveBeenCalledWith(
			'Selected desktop capture source',
			expect.objectContaining({ id: 'screen:1:0', name: 'Entire Screen', displayId: '1' }),
		)

		await session.reset()
	})

	test('cycles screenshot slots and deletes the replaced file', async () => {
		dateSpy.mockReturnValueOnce(1000).mockReturnValueOnce(2000).mockReturnValueOnce(3000)
		const window = createWindowMock()
		const onShouldAnalyze = vi.fn()
		const { ScreenshotSession } = await import('../../src/main/screenshotSession')
		const session = new ScreenshotSession({
			getWindow: () => window,
			hasContext: () => false,
			onShouldAnalyze,
			logger,
		})

		await session.save(Buffer.from('first screenshot'), 'test')
		const firstPath = session.paths[0]
		await session.save(Buffer.from('second screenshot'), 'test')
		await session.save(Buffer.from('third screenshot'), 'test')

		expect(session.paths).toHaveLength(2)
		expect(session.paths[0]).not.toBe(firstPath)
		expect(session.paths[1]).toContain('screenshot-2-2000.png')
		expect(onShouldAnalyze).toHaveBeenCalledTimes(1)
		await expect(import('node:fs/promises').then((fs) => fs.stat(firstPath ?? ''))).rejects.toMatchObject({
			code: 'ENOENT',
		})

		await session.reset()
	})
})
