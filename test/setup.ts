// Test setup file for Bun tests
import { afterAll, beforeAll } from 'bun:test'

beforeAll(() => {
	// Set test environment
	process.env.NODE_ENV = 'test'
	
	// Mock console methods to reduce test output noise
	const originalConsoleWarn = console.warn
	const originalConsoleError = console.error
	
	console.warn = (...args: any[]) => {
		// Suppress specific warnings during tests
		const message = args.join(' ')
		if (message.includes('ExperimentalWarning') || message.includes('electron')) {
			return
		}
		originalConsoleWarn.apply(console, args)
	}
	
	console.error = (...args: any[]) => {
		// Suppress specific errors during tests
		const message = args.join(' ')
		if (message.includes('electron') || message.includes('GPU process')) {
			return
		}
		originalConsoleError.apply(console, args)
	}
})

afterAll(() => {
	// Cleanup any test artifacts
	process.env.NODE_ENV = undefined
})