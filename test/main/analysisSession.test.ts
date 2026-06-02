import { beforeEach, describe, expect, test, vi } from 'vitest'

const analyzeImagesSmart = vi.fn()

vi.mock('../../src/services', () => ({
	analyzeImagesSmart: (...args: unknown[]) => analyzeImagesSmart(...args),
}))

vi.mock('../../src/services/providers', () => ({
	getAvailableModels: vi.fn(async () => ['model-a']),
	getCurrentProvider: vi.fn(() => 'openrouter'),
	isAnyProviderConfigured: vi.fn(() => true),
}))

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve
	})
	return { promise, resolve }
}

describe('AnalysisSession', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test('queues one pending analysis when a request arrives while analysis is running', async () => {
		const first = deferred<string>()
		const second = deferred<string>()
		analyzeImagesSmart.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

		const send = vi.fn()
		const window = { webContents: { send } } as never
		const { AnalysisSession } = await import('../../src/main/analysisSession')
		const session = new AnalysisSession({
			getWindow: () => window,
			getImagePaths: () => ['one.png', 'two.png'],
			logger,
		})

		const analysisPromise = session.triggerAnalysis()
		await vi.waitFor(() => expect(analyzeImagesSmart).toHaveBeenCalledTimes(1))
		const queuedPromise = session.triggerAnalysis()

		expect(analyzeImagesSmart).toHaveBeenCalledTimes(1)

		first.resolve('first result')
		await vi.waitFor(() => expect(analyzeImagesSmart).toHaveBeenCalledTimes(2))
		second.resolve('second result')

		await analysisPromise
		await queuedPromise

		expect(send).toHaveBeenCalledWith('analysis-result', 'first result')
		expect(send).toHaveBeenCalledWith('analysis-result', 'second result')
	})
})
