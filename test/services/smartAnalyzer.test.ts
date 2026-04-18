import { describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

describe('Smart Analyzer', () => {
	test('should return helpful error when no images provided', async () => {
		const { analyzeImagesSmart } = await import('../../src/services/smartAnalyzer')
		const result = await analyzeImagesSmart({ imagePaths: [] })

		expect(result.toLowerCase()).toContain('no screenshots')
		expect(result.toLowerCase()).toContain('capture at least one screenshot')
	})
})
