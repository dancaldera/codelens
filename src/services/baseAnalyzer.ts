import { createLogger } from '../lib/logger'
import type { ImageContent } from './openrouter/service'

const logger = createLogger('BaseAnalyzer')

export const TIMEOUT_DURATION = 60000

/**
 * Create a timeout handler for analysis functions
 */
export function createTimeoutHandler<T>(
	_defaultResponse: T,
	analysisType: string,
): { timeout: ReturnType<typeof setTimeout>; clear: () => void } {
	const timeout = setTimeout(() => {
		logger.warn(`${analysisType} timeout after ${TIMEOUT_DURATION}ms`)
	}, TIMEOUT_DURATION)

	return {
		timeout,
		clear: () => clearTimeout(timeout),
	}
}

/**
 * Validate that image paths are provided
 */
export function validateImagePaths(
	imagePaths: string[] | undefined,
	_timeout: { clear: () => void },
): imagePaths is string[] & { length: number } {
	if (!imagePaths?.length) {
		logger.error('No image paths provided')
		return false
	}
	return true
}

/**
 * Check if processed images are valid
 */
export function validateProcessedImages(
	imageContents: ImageContent[],
	_timeout: { clear: () => void },
	errorMessage: string,
): imageContents is ImageContent[] {
	if (!imageContents.length) {
		logger.error(errorMessage)
		return false
	}
	return true
}

/**
 * Check if an error is related to API/service issues
 */
export function isServiceError(error: unknown): boolean {
	return error instanceof Error && error.message.includes('API')
}

/**
 * Build error message based on error type
 */
export function buildErrorMessage(error: unknown): { message: string; details: string } {
	const serviceError = isServiceError(error)
	return {
		message: serviceError ? 'AI service unavailable' : 'Analysis failed',
		details: serviceError ? 'Please check your API key and provider availability' : 'Please try again',
	}
}

/**
 * Run analysis with common timeout and error handling
 */
export async function runAnalysis<T>(
	analysisFn: () => Promise<T>,
	defaultResponse: T,
	analysisType: string,
): Promise<T> {
	const timer = createTimeoutHandler(defaultResponse, analysisType)

	try {
		const result = await analysisFn()
		timer.clear()
		return result
	} catch (error) {
		timer.clear()
		const { message, details } = buildErrorMessage(error)
		logger.error(`${analysisType} failed`, {
			error: error instanceof Error ? error.message : String(error),
		})

		// Try to cast the default response to T (caller must provide correct type)
		return { ...defaultResponse, ...{ message, details } } as T
	}
}
