import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock Electron app to avoid import issues
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('API Key Detection Functionality', () => {
	let originalApiKey: string | undefined
	let isOpenAIConfigured: any

	beforeEach(async () => {
		// Store original API key
		originalApiKey = process.env.OPENAI_API_KEY
		
		// Import the function after mocking
		const module = await import('../../src/services/openai/client')
		isOpenAIConfigured = module.isOpenAIConfigured
	})

	afterEach(() => {
		// Restore original API key
		if (originalApiKey !== undefined) {
			process.env.OPENAI_API_KEY = originalApiKey
		} else {
			delete process.env.OPENAI_API_KEY
		}
	})

	test('should detect when no API key is configured', () => {
		delete process.env.OPENAI_API_KEY
		expect(isOpenAIConfigured()).toBe(false)
	})

	test('should detect when API key is empty', () => {
		process.env.OPENAI_API_KEY = ''
		expect(isOpenAIConfigured()).toBe(false)
	})

	test('should detect when API key has invalid format', () => {
		process.env.OPENAI_API_KEY = 'invalid-key-format'
		expect(isOpenAIConfigured()).toBe(false)
	})

	test('should detect when API key is properly configured', () => {
		process.env.OPENAI_API_KEY = 'sk-test123456'
		expect(isOpenAIConfigured()).toBe(true)
	})

	test('should work with real OpenAI API key format', () => {
		process.env.OPENAI_API_KEY = 'sk-proj-abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz56'
		expect(isOpenAIConfigured()).toBe(true)
	})
})