import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Mock Electron app before importing the module
const mockApp = {
	isPackaged: false,
	getPath: vi.fn(() => '/tmp/test-logs'),
}

vi.mock('electron', () => ({ app: mockApp }))

// Mock fetch for API calls
const mockFetch = vi.fn((url: string | URL) => {
	if (String(url).includes('/api/v1/models?category=programming')) {
		return Promise.resolve({
			ok: true,
			json: () =>
				Promise.resolve({
					data: [
						{
							id: 'anthropic/claude-sonnet-4.6',
							name: 'Anthropic: Claude Sonnet 4.6',
							architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
							context_length: 1000000,
							pricing: { prompt: '0.000003', completion: '0.000015' },
						},
						{
							id: 'google/gemini-3.5-flash',
							name: 'Google: Gemini 3.5 Flash',
							architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
							context_length: 1048576,
							pricing: { prompt: '0.0000015', completion: '0.000009' },
						},
						{
							id: 'openai/gpt-5.5',
							name: 'OpenAI: GPT-5.5',
							architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
							context_length: 1050000,
							pricing: { prompt: '0.000005', completion: '0.00003' },
						},
						{
							id: 'text-only-model',
							name: 'Text Only Model',
							architecture: { input_modalities: ['text'], output_modalities: ['text'] },
							context_length: 128000,
							pricing: { prompt: '0.000001', completion: '0.000002' },
						},
					],
				}),
		})
	}
	return Promise.reject(new Error('Not found'))
})

global.fetch = mockFetch as any

describe('Provider Management', () => {
	let originalOpenRouterKey: string | undefined
	let getCurrentProvider: any
	let isAnyProviderConfigured: any
	let getAvailableModels: any
	let getAvailableModelsSync: any
	let getDefaultModel: any
	let getProviderInfo: any
	let refreshModelsCache: any

	beforeEach(async () => {
		// Store original environment variables
		originalOpenRouterKey = process.env.OPENROUTER_API_KEY

		// Import the functions after mocking
		const module = await import('../../src/services/providers')
		getCurrentProvider = module.getCurrentProvider
		isAnyProviderConfigured = module.isAnyProviderConfigured
		getAvailableModels = module.getAvailableModels
		getAvailableModelsSync = module.getAvailableModelsSync
		getDefaultModel = module.getDefaultModel
		getProviderInfo = module.getProviderInfo
		refreshModelsCache = module.refreshModelsCache
	})

	afterEach(() => {
		// Restore original environment variables
		if (originalOpenRouterKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalOpenRouterKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
	})

	describe('getCurrentProvider', () => {
		test('should always return openrouter', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getCurrentProvider()).toBe('openrouter')
		})

		test('should return openrouter even when not configured', () => {
			delete process.env.OPENROUTER_API_KEY
			expect(getCurrentProvider()).toBe('openrouter')
		})
	})

	describe('isAnyProviderConfigured', () => {
		test('should return true when OpenRouter is configured', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(isAnyProviderConfigured()).toBe(true)
		})

		test('should return false when OpenRouter is not configured', () => {
			delete process.env.OPENROUTER_API_KEY
			expect(isAnyProviderConfigured()).toBe(false)
		})
	})

	describe('getAvailableModels', () => {
		test('should fetch models from API and filter image-supporting models', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			await refreshModelsCache() // Clear cache first
			const models = await getAvailableModels()
			expect(models).toContain('anthropic/claude-sonnet-4.6')
			expect(models).toContain('google/gemini-3.5-flash')
			expect(models).toContain('openai/gpt-5.5')
			expect(models).not.toContain('text-only-model') // Should filter out text-only models
		})

		test('should return cached models on subsequent calls', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const models1 = await getAvailableModels()
			const callCount1 = mockFetch.mock.calls.length

			const models2 = await getAvailableModels()
			const callCount2 = mockFetch.mock.calls.length

			expect(models1).toEqual(models2)
			expect(callCount2).toBe(callCount1) // No additional API calls
		})

		test('should return fallback models on API failure', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			await refreshModelsCache()

			// Mock a failed fetch
			const originalFetch = global.fetch
			global.fetch = vi.fn(() => Promise.reject(new Error('API Error'))) as any

			const models = await getAvailableModels()
			expect(models).toContain('anthropic/claude-sonnet-4.6')
			expect(models).toContain('google/gemini-3.5-flash')
			expect(models).toContain('openai/gpt-5.5')

			// Restore original fetch
			global.fetch = originalFetch
		})
	})

	describe('getAvailableModelsSync', () => {
		test('should return fallback models when cache is empty', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const models = getAvailableModelsSync()
			expect(models.length).toBeGreaterThan(0)
			expect(models).toContain('anthropic/claude-sonnet-4.6')
		})

		test('should return cached models if available', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			// Populate cache first
			await refreshModelsCache()
			await getAvailableModels()

			const models = getAvailableModelsSync()
			expect(models).toContain('anthropic/claude-sonnet-4.6')
			expect(models).toContain('google/gemini-3.5-flash')
		})
	})

	describe('refreshModelsCache', () => {
		test('should clear cache and fetch fresh models', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			// First call to populate cache
			await getAvailableModels()
			const callCount1 = mockFetch.mock.calls.length

			// Refresh cache
			await refreshModelsCache()
			const callCount2 = mockFetch.mock.calls.length

			expect(callCount2).toBeGreaterThan(callCount1) // New API call made
		})
	})

	describe('getDefaultModel', () => {
		test('should return anthropic/claude-sonnet-4.6 for OpenRouter', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getDefaultModel()).toBe('anthropic/claude-sonnet-4.6')
		})
	})

	describe('getProviderInfo', () => {
		test('should return correct info for OpenRouter when configured', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const info = getProviderInfo()
			expect(info.provider).toBe('openrouter')
			expect(info.displayName).toBe('OpenRouter')
			expect(info.isConfigured).toBe(true)
		})

		test('should show unconfigured when no API key is provided', () => {
			delete process.env.OPENROUTER_API_KEY
			const info = getProviderInfo()
			expect(info.provider).toBe('openrouter')
			expect(info.isConfigured).toBe(false)
		})
	})
})
