import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock Electron app before importing the module
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('Provider Management', () => {
	let originalOpenAIKey: string | undefined
	let originalOpenRouterKey: string | undefined
	let originalProvider: string | undefined
	let getCurrentProvider: any
	let isAnyProviderConfigured: any
	let getAvailableModels: any
	let getDefaultModel: any
	let getProviderInfo: any

	beforeEach(async () => {
		// Store original environment variables
		originalOpenAIKey = process.env.OPENAI_API_KEY
		originalOpenRouterKey = process.env.OPENROUTER_API_KEY
		originalProvider = process.env.AI_PROVIDER
		
		// Import the functions after mocking
		const module = await import('../../src/services/providers')
		getCurrentProvider = module.getCurrentProvider
		isAnyProviderConfigured = module.isAnyProviderConfigured
		getAvailableModels = module.getAvailableModels
		getDefaultModel = module.getDefaultModel
		getProviderInfo = module.getProviderInfo
	})

	afterEach(() => {
		// Restore original environment variables
		if (originalOpenAIKey !== undefined) {
			process.env.OPENAI_API_KEY = originalOpenAIKey
		} else {
			delete process.env.OPENAI_API_KEY
		}
		
		if (originalOpenRouterKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalOpenRouterKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
		
		if (originalProvider !== undefined) {
			process.env.AI_PROVIDER = originalProvider
		} else {
			delete process.env.AI_PROVIDER
		}
	})

	describe('getCurrentProvider', () => {
		test('should return openai when AI_PROVIDER is set to openai', () => {
			process.env.AI_PROVIDER = 'openai'
			process.env.OPENAI_API_KEY = 'sk-test123'
			expect(getCurrentProvider()).toBe('openai')
		})

		test('should return openrouter when AI_PROVIDER is set to openrouter', () => {
			process.env.AI_PROVIDER = 'openrouter'
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getCurrentProvider()).toBe('openrouter')
		})

		test('should default to openai when both providers are configured but no AI_PROVIDER set', () => {
			delete process.env.AI_PROVIDER
			process.env.OPENAI_API_KEY = 'sk-test123'
			process.env.OPENROUTER_API_KEY = 'sk-test456'
			expect(getCurrentProvider()).toBe('openai')
		})

		test('should fallback to openrouter when only OpenRouter is configured', () => {
			delete process.env.AI_PROVIDER
			delete process.env.OPENAI_API_KEY
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getCurrentProvider()).toBe('openrouter')
		})

		test('should default to openai when no providers are configured', () => {
			delete process.env.AI_PROVIDER
			delete process.env.OPENAI_API_KEY
			delete process.env.OPENROUTER_API_KEY
			expect(getCurrentProvider()).toBe('openai')
		})
	})

	describe('isAnyProviderConfigured', () => {
		test('should return true when OpenAI is configured', () => {
			process.env.OPENAI_API_KEY = 'sk-test123'
			delete process.env.OPENROUTER_API_KEY
			expect(isAnyProviderConfigured()).toBe(true)
		})

		test('should return true when OpenRouter is configured', () => {
			delete process.env.OPENAI_API_KEY
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(isAnyProviderConfigured()).toBe(true)
		})

		test('should return true when both providers are configured', () => {
			process.env.OPENAI_API_KEY = 'sk-test123'
			process.env.OPENROUTER_API_KEY = 'sk-test456'
			expect(isAnyProviderConfigured()).toBe(true)
		})

		test('should return false when no providers are configured', () => {
			delete process.env.OPENAI_API_KEY
			delete process.env.OPENROUTER_API_KEY
			expect(isAnyProviderConfigured()).toBe(false)
		})
	})

	describe('getAvailableModels', () => {
		test('should return OpenAI models when using OpenAI provider', () => {
			process.env.AI_PROVIDER = 'openai'
			process.env.OPENAI_API_KEY = 'sk-test123'
			const models = getAvailableModels()
			expect(models).toContain('gpt-4o')
			expect(models).toContain('gpt-4o-mini')
		})

		test('should return OpenRouter models when using OpenRouter provider', () => {
			process.env.AI_PROVIDER = 'openrouter'
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const models = getAvailableModels()
			expect(models).toContain('openai/gpt-4o')
			expect(models).toContain('openai/gpt-4o-mini')
		})
	})

	describe('getDefaultModel', () => {
		test('should return gpt-4o for OpenAI provider', () => {
			process.env.AI_PROVIDER = 'openai'
			process.env.OPENAI_API_KEY = 'sk-test123'
			expect(getDefaultModel()).toBe('gpt-4o')
		})

		test('should return openai/gpt-4o for OpenRouter provider', () => {
			process.env.AI_PROVIDER = 'openrouter'
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getDefaultModel()).toBe('openai/gpt-4o')
		})
	})

	describe('getProviderInfo', () => {
		test('should return correct info for OpenAI provider', () => {
			process.env.AI_PROVIDER = 'openai'
			process.env.OPENAI_API_KEY = 'sk-test123'
			const info = getProviderInfo()
			expect(info.provider).toBe('openai')
			expect(info.displayName).toBe('OpenAI')
			expect(info.isConfigured).toBe(true)
		})

		test('should return correct info for OpenRouter provider', () => {
			process.env.AI_PROVIDER = 'openrouter'
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const info = getProviderInfo()
			expect(info.provider).toBe('openrouter')
			expect(info.displayName).toBe('OpenRouter')
			expect(info.isConfigured).toBe(true)
		})

		test('should show unconfigured when no API key is provided', () => {
			process.env.AI_PROVIDER = 'openai'
			delete process.env.OPENAI_API_KEY
			const info = getProviderInfo()
			expect(info.provider).toBe('openai')
			expect(info.isConfigured).toBe(false)
		})
	})
})