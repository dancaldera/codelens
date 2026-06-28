import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}
const analyzeMock = vi.fn(async () => 'voice-only answer')

vi.mock('electron', () => ({ app: mockApp }))
vi.mock('../../src/services/openrouter/service', () => ({
	OpenRouterService: class {
		analyze = analyzeMock
	},
}))

describe('Smart Analyzer', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test('should return helpful error when no context is provided', async () => {
		const { analyzeImagesSmart } = await import('../../src/services/smartAnalyzer')
		const result = await analyzeImagesSmart({ imagePaths: [] })

		expect(result.toLowerCase()).toContain('no screenshots')
		expect(result.toLowerCase()).toContain('capture at least one screenshot')
		expect(analyzeMock).not.toHaveBeenCalled()
	})

	test('analyzes voice-only context without screenshots', async () => {
		const { analyzeImagesSmart } = await import('../../src/services/smartAnalyzer')
		const result = await analyzeImagesSmart({
			imagePaths: [],
			voiceContext: 'Explain binary search in TypeScript.',
			model: 'model-a',
		})

		expect(result).toBe('voice-only answer')
		expect(analyzeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				images: [],
				prompt: expect.stringContaining('Explain binary search in TypeScript.'),
			}),
		)
	})
})
