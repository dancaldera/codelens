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

	beforeEach(() => {
		vi.resetModules()
		mockFetch.mockClear()
		originalOpenRouterKey = process.env.OPENROUTER_API_KEY
	})

	afterEach(() => {
		if (originalOpenRouterKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalOpenRouterKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
	})

	describe('isProviderConfigured', () => {
		test('should return true when OpenRouter is configured', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const { isProviderConfigured } = await import('../../src/services/providers')
			expect(isProviderConfigured('openrouter')).toBe(true)
		})

		test('should return false when OpenRouter is not configured', async () => {
			delete process.env.OPENROUTER_API_KEY
			const { isProviderConfigured } = await import('../../src/services/providers')
			expect(isProviderConfigured('openrouter')).toBe(false)
		})
	})

	describe('getAvailableModels', () => {
		test('should fetch models from API and filter image-supporting models', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const { getAvailableModels, PROVIDERS } = await import('../../src/services/providers')
			const { ids, error } = await getAvailableModels(PROVIDERS.openrouter)
			expect(ids).toContain('anthropic/claude-sonnet-4.6')
			expect(ids).not.toContain('text-only-model')
			expect(error).toBeNull()
		})

		test('should return cached models on subsequent calls', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const { getAvailableModels, PROVIDERS } = await import('../../src/services/providers')
			await getAvailableModels(PROVIDERS.openrouter)
			const callCount1 = mockFetch.mock.calls.length
			await getAvailableModels(PROVIDERS.openrouter)
			expect(mockFetch.mock.calls.length).toBe(callCount1)
		})

		test('should return fallback models with an error on API failure', async () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			global.fetch = vi.fn(() => Promise.reject(new Error('API Error'))) as any
			const { getAvailableModels, PROVIDERS } = await import('../../src/services/providers')
			const { ids, error } = await getAvailableModels(PROVIDERS.openrouter)
			expect(ids).toContain('anthropic/claude-sonnet-4.6')
			expect(error).toBe('API Error')
		})

		test('should return static models for providers without a models API', async () => {
			const { getAvailableModels, PROVIDERS } = await import('../../src/services/providers')
			const { ids, error } = await getAvailableModels(PROVIDERS.deepseek)
			expect(ids).toContain('deepseek-chat')
			expect(error).toBeNull()
		})
	})
})
