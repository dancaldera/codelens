import { describe, expect, mock, test } from 'bun:test'

const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs'),
}

mock.module('electron', () => ({ app: mockApp }))

describe('General Analyzer', () => {
	test('should return helpful error when no images provided', async () => {
		const { analyzeGeneralContentFromImages } = await import('../../src/services/generalAnalyzer')
		const result = await analyzeGeneralContentFromImages([])

		expect(result.answer.toLowerCase()).toContain('no images')
		expect(result.test.toLowerCase()).toContain('no test')
	})
})
