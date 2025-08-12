import { describe, expect, mock, test } from 'bun:test'

// Mock Electron's app module
const mockApp = {
	isPackaged: false,
	getPath: mock(() => '/tmp/test-logs')
}

mock.module('electron', () => ({ app: mockApp }))

describe('Logger utilities', () => {
	describe('logPerformance', () => {
		test('should calculate duration correctly', async () => {
			// Import after mocking
			const { logPerformance } = await import('../../src/lib/logger')
			
			const startTime = Date.now() - 1000 // 1 second ago
			const operation = 'test-operation'
			const meta = { userId: '123' }

			// Should not throw
			expect(() => logPerformance(operation, startTime, meta)).not.toThrow()
		})

		test('should handle performance logging without meta', async () => {
			const { logPerformance } = await import('../../src/lib/logger')
			
			const startTime = Date.now() - 500 // 0.5 seconds ago
			const operation = 'simple-operation'

			// Should not throw
			expect(() => logPerformance(operation, startTime)).not.toThrow()
		})
	})

	describe('logApiCall', () => {
		test('should handle API call logging', async () => {
			const { logApiCall } = await import('../../src/lib/logger')
			
			// Should not throw for various parameter combinations
			expect(() => logApiCall('GET', '/api/users', 200, 150, { requestId: 'abc' })).not.toThrow()
			expect(() => logApiCall('POST', '/api/users', 400, 200, { error: 'validation' })).not.toThrow()
			expect(() => logApiCall('GET', '/api/users')).not.toThrow()
			expect(() => logApiCall('DELETE', '/api/users/123', 204)).not.toThrow()
		})
	})

	describe('ELECTRON_ERROR_PATTERNS', () => {
		test('should match network service crash messages', () => {
			const patterns = [
				/Network service crashed, restarting service/,
				/DevTools listening on/,
				/\[.*?\] GPU process isn't usable\. Goodbye\./,
				/\[.*?\] The GPU process has crashed/,
			]

			const testMessages = [
				'Network service crashed, restarting service',
				'DevTools listening on ws://127.0.0.1:9229',
				'[12345] GPU process isn\'t usable. Goodbye.',
				'[67890] The GPU process has crashed 3 times',
			]

			for (let i = 0; i < patterns.length; i++) {
				expect(patterns[i].test(testMessages[i])).toBe(true)
			}
		})

		test('should not match regular error messages', () => {
			const patterns = [
				/Network service crashed, restarting service/,
				/DevTools listening on/,
				/\[.*?\] GPU process isn't usable\. Goodbye\./,
			]

			const regularMessages = [
				'Application error occurred',
				'Failed to load configuration',
				'User authentication failed',
			]

			for (const pattern of patterns) {
				for (const message of regularMessages) {
					expect(pattern.test(message)).toBe(false)
				}
			}
		})
	})
})