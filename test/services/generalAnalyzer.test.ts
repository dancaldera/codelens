import { describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

describe('General Analyzer', () => {
	test('should return helpful error when no images provided', async () => {
		const { analyzeGeneralContentFromImages } = await import('../../src/services/generalAnalyzer')
		const result = await analyzeGeneralContentFromImages([])

		expect(result.answer.toLowerCase()).toContain('no images')
		expect(result.test.toLowerCase()).toContain('no test')
	})
})
