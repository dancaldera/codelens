import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock Electron app before importing the module
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('OpenAI Client', () => {
	let originalApiKey: string | undefined
	let isOpenAIConfigured: any
	let validateOpenAIConfiguration: any

	beforeEach(async () => {
		// Store original API key
		originalApiKey = process.env.OPENAI_API_KEY
		
		// Import the functions after mocking
		const module = await import('../../../src/services/openai/client')
		isOpenAIConfigured = module.isOpenAIConfigured
		validateOpenAIConfiguration = module.validateOpenAIConfiguration
	})

	afterEach(() => {
		// Restore original API key
		if (originalApiKey !== undefined) {
			process.env.OPENAI_API_KEY = originalApiKey
		} else {
			delete process.env.OPENAI_API_KEY
		}
	})

	describe('isOpenAIConfigured', () => {
		test('should return false when API key is not set', () => {
			delete process.env.OPENAI_API_KEY
			expect(isOpenAIConfigured()).toBe(false)
		})

		test('should return false when API key is empty', () => {
			process.env.OPENAI_API_KEY = ''
			expect(isOpenAIConfigured()).toBe(false)
		})

		test('should return false when API key does not start with sk-', () => {
			process.env.OPENAI_API_KEY = 'invalid-key'
			expect(isOpenAIConfigured()).toBe(false)
		})

		test('should return true when API key is properly formatted', () => {
			process.env.OPENAI_API_KEY = 'sk-test123'
			expect(isOpenAIConfigured()).toBe(true)
		})

		test('should return true for real-looking API key format', () => {
			process.env.OPENAI_API_KEY = 'sk-proj-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz56'
			expect(isOpenAIConfigured()).toBe(true)
		})
	})

	describe('validateOpenAIConfiguration', () => {
		test('should throw error when API key is not set', () => {
			delete process.env.OPENAI_API_KEY
			expect(() => validateOpenAIConfiguration()).toThrow(
				'OpenAI API key not found. Please set OPENAI_API_KEY environment variable.'
			)
		})

		test('should throw error when API key is empty', () => {
			process.env.OPENAI_API_KEY = ''
			expect(() => validateOpenAIConfiguration()).toThrow(
				'OpenAI API key not found. Please set OPENAI_API_KEY environment variable.'
			)
		})

		test('should throw error when API key does not start with sk-', () => {
			process.env.OPENAI_API_KEY = 'invalid-key'
			expect(() => validateOpenAIConfiguration()).toThrow(
				'Invalid OpenAI API key format. API key should start with "sk-".'
			)
		})

		test('should not throw when API key is properly formatted', () => {
			process.env.OPENAI_API_KEY = 'sk-test123'
			expect(() => validateOpenAIConfiguration()).not.toThrow()
		})

		test('should not throw for real-looking API key format', () => {
			process.env.OPENAI_API_KEY = 'sk-proj-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz56'
			expect(() => validateOpenAIConfiguration()).not.toThrow()
		})
	})
})