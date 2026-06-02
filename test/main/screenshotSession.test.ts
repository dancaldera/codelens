import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
	desktopCapturer: {
		getSources: vi.fn(),
	},
}))

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

function createWindowMock() {
	return {
		webContents: { send: vi.fn() },
	} as never
}

describe('ScreenshotSession', () => {
	let dateSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		vi.clearAllMocks()
		dateSpy = vi.spyOn(Date, 'now')
	})

	afterEach(() => {
		dateSpy.mockRestore()
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

		await session.cleanupSessionFiles()
	})
})
