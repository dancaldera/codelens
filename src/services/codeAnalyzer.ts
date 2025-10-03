import * as fs from 'node:fs'
import { createLogger, logPerformance } from '../lib/logger'
import { getMimeType, validateImageFile } from '../lib/utils'
import type { AnalysisRequest, AnalysisResponse, ImageContent } from './openrouter/service'
import { analyzeCodeWithProvider, type Provider } from './providers'

// Type definitions
export type CodeAnalysisResult = {
	code: string
	summary: string
	timeComplexity: string
	spaceComplexity: string
	language: string
}

const logger = createLogger('CodeAnalyzer')

// Helper functions
function createErrorResponse(error: string, details: string): CodeAnalysisResult {
	return {
		code: error,
		summary: details,
		timeComplexity: 'N/A',
		spaceComplexity: 'N/A',
		language: 'Unknown',
	}
}

function handleCodeResult(
	result: AnalysisResponse,
	onLanguageDetected?: (language: string) => void,
): CodeAnalysisResult {
	if (result.language && result.language !== 'Unknown' && onLanguageDetected) {
		onLanguageDetected(result.language)
	}
	return result
}

// Enhanced prompt for code analysis
const CODE_PROMPT = `You are an expert software engineer and code analyst. Analyze the code shown in these screenshots with precision and expertise.

Your tasks:
1. EXTRACT the exact code from the image(s) - be precise and complete
2. IDENTIFY the programming language
3. UNDERSTAND what the code does and explain it clearly
4. ANALYZE the algorithmic complexity (time and space)
5. PROVIDE insights, improvements, or solutions if there are issues

Focus on:
- Accuracy in code extraction
- Clear, technical explanations
- Practical insights for developers
- Best practices and optimization opportunities

If there are errors, bugs, or improvements possible, highlight them with solutions.`

/**
 * Main analysis function - analyzes code from screenshots
 */
export async function analyzeContentFromImages(
	imagePaths: string[],
	customPrompt?: string,
	_mode: 'code' = 'code', // Kept for compatibility but always uses code mode
	previousContext?: string,
	onLanguageDetected?: (language: string) => void,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<CodeAnalysisResult> {
	const startTime = Date.now()
	logger.info(`Starting code analysis for ${imagePaths.length} images`)

	// Use enhanced prompt or custom prompt
	const prompt = customPrompt || CODE_PROMPT

	// Default response
	const defaultResponse: CodeAnalysisResult = {
		code: 'Analysis failed or timed out',
		summary: 'Unable to complete analysis',
		timeComplexity: 'Unknown',
		spaceComplexity: 'Unknown',
		language: 'Unknown',
	}

	// Timeout protection
	const timeoutDuration = 60000
	const analysisTimeout = setTimeout(() => {
		logger.warn(`Analysis timeout after ${timeoutDuration}ms`)
		return defaultResponse
	}, timeoutDuration)

	try {
		// Input validation
		if (!imagePaths?.length) {
			logger.error('No image paths provided')
			clearTimeout(analysisTimeout)
			return createErrorResponse('No images provided', 'Please capture screenshots first')
		}

		// Process images
		const imageContents = await processImages(imagePaths)
		if (!imageContents.length) {
			logger.error('Image processing failed')
			clearTimeout(analysisTimeout)
			return createErrorResponse('Failed to process images', 'Please check image files')
		}

		// Prepare and execute analysis
		const analysisRequest: AnalysisRequest = {
			images: imageContents,
			prompt,
			previousContext,
		}

		logger.info('Executing analysis', { model, provider: providerOverride })
		const result = await analyzeCodeWithProvider(analysisRequest, model, providerOverride)

		// Handle results
		const finalResult = handleCodeResult(result, onLanguageDetected)

		clearTimeout(analysisTimeout)
		logPerformance('Code analysis completed', startTime)
		return finalResult
	} catch (error) {
		logger.error('Analysis failed', { error: error instanceof Error ? error.message : String(error) })
		clearTimeout(analysisTimeout)

		const isServiceError = error instanceof Error && error.message.includes('API')
		const errorMsg = isServiceError ? 'AI service unavailable' : 'Analysis failed'
		const details = isServiceError ? 'Please check your API key' : 'Please try again'

		return createErrorResponse(errorMsg, details)
	}
}

/**
 * Legacy compatibility function
 */
export async function analyzeCodeFromImages(
	imagePaths: string[],
	prompt?: string,
	previousContext?: string,
	onLanguageDetected?: (language: string) => void,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<CodeAnalysisResult> {
	return analyzeContentFromImages(
		imagePaths,
		prompt,
		'code',
		previousContext,
		onLanguageDetected,
		model,
		providerOverride,
	) as Promise<CodeAnalysisResult>
}

/**
 * Process and validate images for analysis
 */
async function processImages(imagePaths: string[]): Promise<ImageContent[]> {
	const startTime = Date.now()
	logger.debug('Processing images', { count: imagePaths.length })

	const results = await Promise.all(
		imagePaths.map(async (path) => {
			try {
				// Validate and read image
				const stats = await fs.promises.stat(path)
				const validation = validateImageFile(stats)
				if (!validation.isValid) {
					logger.error('Invalid image', { path, error: validation.error })
					return null
				}

				const imageBuffer = await fs.promises.readFile(path)
				const base64Image = imageBuffer.toString('base64')
				const mimeType = getMimeType(path)

				return {
					type: 'image_url' as const,
					image_url: { url: `data:${mimeType};base64,${base64Image}` },
				}
			} catch (error) {
				logger.error('Image processing failed', { path, error })
				return null
			}
		}),
	)

	const validImages = results.filter((img): img is ImageContent => img !== null)
	logPerformance('Image processing', startTime)
	logger.info('Images processed', { valid: validImages.length, total: imagePaths.length })

	return validImages
}

/**
 * Extend existing analysis with new images
 */
export async function extendAnalysisWithImage(
	previousAnalysis: CodeAnalysisResult,
	newImagePaths: string[],
	customPrompt?: string,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<CodeAnalysisResult> {
	if (!newImagePaths?.length) {
		logger.error('No new images provided for extension')
		return previousAnalysis
	}

	try {
		// Verify images
		for (const path of newImagePaths) {
			const stats = await fs.promises.stat(path)
			const validation = validateImageFile(stats)
			if (!validation.isValid) {
				throw new Error(`Invalid image: ${path}`)
			}
		}

		// Create context from previous analysis
		const contextString = JSON.stringify(previousAnalysis)

		// Enhanced prompt for extension
		const prompt =
			customPrompt ||
			`${CODE_PROMPT}

IMPORTANT: This is an extension of previous analysis. Incorporate the new image(s) with the existing analysis, updating or expanding as needed.`

		logger.info('Extending analysis', { newImages: newImagePaths.length })
		return await analyzeContentFromImages(
			newImagePaths,
			prompt,
			'code',
			contextString,
			undefined,
			model,
			providerOverride,
		)
	} catch (error) {
		logger.error('Extension failed', { error })

		// Return previous analysis with error note
		return {
			...previousAnalysis,
			summary: `${previousAnalysis.summary}

⚠️ Failed to extend with new image`,
		}
	}
}
