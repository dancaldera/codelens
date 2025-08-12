import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock Electron app before importing the module
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('OpenRouter Client', () => {
	let originalApiKey: string | undefined
	let isOpenRouterConfigured: any
	let validateOpenRouterConfiguration: any

	beforeEach(async () => {
		// Store original API key
		originalApiKey = process.env.OPENROUTER_API_KEY
		
		// Import the functions after mocking
		const module = await import('../../../src/services/openrouter/client')
		isOpenRouterConfigured = module.isOpenRouterConfigured
		validateOpenRouterConfiguration = module.validateOpenRouterConfiguration
	})

	afterEach(() => {
		// Restore original API key
		if (originalApiKey !== undefined) {
			process.env.OPENROUTER_API_KEY = originalApiKey
		} else {
			delete process.env.OPENROUTER_API_KEY
		}
	})

	describe('isOpenRouterConfigured', () => {
		test('should return false when API key is not set', () => {
			delete process.env.OPENROUTER_API_KEY
			expect(isOpenRouterConfigured()).toBe(false)
		})

		test('should return false when API key is empty', () => {
			process.env.OPENROUTER_API_KEY = ''
			expect(isOpenRouterConfigured()).toBe(false)
		})

		test('should return false when API key does not start with sk-', () => {
			process.env.OPENROUTER_API_KEY = 'invalid-key'
			expect(isOpenRouterConfigured()).toBe(false)
		})

		test('should return true when API key is properly formatted', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(isOpenRouterConfigured()).toBe(true)
		})

		test('should return true for real-looking API key format', () => {
			process.env.OPENROUTER_API_KEY = 'sk-or-v1-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz56'
			expect(isOpenRouterConfigured()).toBe(true)
		})
	})

	describe('validateOpenRouterConfiguration', () => {
		test('should throw error when API key is not set', () => {
			delete process.env.OPENROUTER_API_KEY
			expect(() => validateOpenRouterConfiguration()).toThrow(
				'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.'
			)
		})

		test('should throw error when API key is empty', () => {
			process.env.OPENROUTER_API_KEY = ''
			expect(() => validateOpenRouterConfiguration()).toThrow(
				'OpenRouter API key not found. Please set OPENROUTER_API_KEY environment variable.'
			)
		})

		test('should throw error when API key does not start with sk-', () => {
			process.env.OPENROUTER_API_KEY = 'invalid-key'
			expect(() => validateOpenRouterConfiguration()).toThrow(
				'Invalid OpenRouter API key format. API key should start with "sk-".'
			)
		})

		test('should not throw when API key is properly formatted', () => {
			process.env.OPENROUTER_API_KEY = 'sk-test123'
			expect(() => validateOpenRouterConfiguration()).not.toThrow()
		})

		test('should not throw for real-looking API key format', () => {
			process.env.OPENROUTER_API_KEY = 'sk-or-v1-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz56'
			expect(() => validateOpenRouterConfiguration()).not.toThrow()
		})
	})
})