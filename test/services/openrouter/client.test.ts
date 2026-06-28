import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

describe('OpenRouter Client configuration guards', () => {
	let originalApiKey: string | undefined

	beforeEach(() => {
		originalApiKey = process.env.OPENROUTER_API_KEY
	})

	afterEach(() => {
		if (originalApiKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalApiKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
	})

	test('isOpenRouterConfigured reflects key presence and format', async () => {
		const { isOpenRouterConfigured } = await import('../../../src/services/openrouter/client')
		delete process.env.OPENROUTER_API_KEY
		expect(isOpenRouterConfigured()).toBe(false)
		process.env.OPENROUTER_API_KEY = 'sk-test123'
		expect(isOpenRouterConfigured()).toBe(true)
	})

	test('validateOpenRouterConfiguration throws with a useful message when unset', async () => {
		const { validateOpenRouterConfiguration } = await import('../../../src/services/openrouter/client')
		delete process.env.OPENROUTER_API_KEY
		expect(() => validateOpenRouterConfiguration()).toThrow(/OpenRouter API key not found/)
	})
})
