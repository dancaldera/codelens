import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock Electron app before importing the module
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('Provider Management', () => {
	let originalOpenRouterKey: string | undefined
	let getCurrentProvider: any
	let isAnyProviderConfigured: any
	let getAvailableModels: any
	let getDefaultModel: any
	let getProviderInfo: any

	beforeEach(async () => {
		// Store original environment variables
		originalOpenRouterKey = process.env.OPENROUTER_API_KEY

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
		test('should return OpenRouter models', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			const models = getAvailableModels()
			expect(models).toContain('anthropic/claude-sonnet-4.5')
			expect(models).toContain('google/gemini-2.5-pro')
			expect(models).toContain('openai/gpt-5')
		})
	})

	describe('getDefaultModel', () => {
		test('should return anthropic/claude-sonnet-4.5 for OpenRouter', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(getDefaultModel()).toBe('anthropic/claude-sonnet-4.5')
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