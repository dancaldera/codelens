import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

const openRouterProvider = {
	id: 'openrouter',
	label: 'OpenRouter',
	envKey: 'OPENROUTER_API_KEY',
	baseUrl: 'https://openrouter.ai/api/v1',
	vision: true,
	transcription: 'json' as const,
	defaultModel: 'anthropic/claude-sonnet-4.6',
	models: null,
	transcriptionModels: [],
	defaultTranscriptionModel: null,
}

describe('Provider configuration guards', () => {
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

	test('isProviderConfigured reflects key presence and format', async () => {
		const { isProviderConfigured } = await import('../../../src/services/providers')
		delete process.env.OPENROUTER_API_KEY
		expect(isProviderConfigured('openrouter')).toBe(false)
		process.env.OPENROUTER_API_KEY = 'sk-test123'
		expect(isProviderConfigured('openrouter')).toBe(true)
	})

	test('validateProviderConfiguration throws with a useful message when unset', async () => {
		const { validateProviderConfiguration } = await import('../../../src/services/openrouter/client')
		delete process.env.OPENROUTER_API_KEY
		expect(() => validateProviderConfiguration(openRouterProvider)).toThrow(/OpenRouter API key not found/)
	})
})
