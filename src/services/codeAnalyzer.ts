import * as fs from 'node:fs'
import { createLogger, logPerformance } from '../lib/logger'
import { getMimeType, validateImageFile } from '../lib/utils'
import type { AnalysisRequest, AnalysisResponse, ImageContent } from './openai/service'
import { analyzeCodeWithProvider, type Provider } from './providers'

// Type definitions
export type CodeAnalysisResult = {
	code: string
	summary: string
	timeComplexity: string
	spaceComplexity: string
	language: string
}

export type GeneralAnalysisResult = {
	content: string
	type: string
	response: string
	context: string
}

export type AnalysisMode = 'code' | 'general'

const logger = createLogger('CodeAnalyzer')

// Helper functions
function createErrorResponse(mode: AnalysisMode, error: string, details: string) {
	if (mode === 'code') {
		return {
			code: error,
			summary: details,
			timeComplexity: 'N/A',
			spaceComplexity: 'N/A',
			language: 'Unknown',
		} as CodeAnalysisResult
	}
	return {
		content: error,
		type: 'Error',
		response: details,
		context: 'Analysis failed',
	} as GeneralAnalysisResult
}

function handleCodeResult(result: AnalysisResponse, onLanguageDetected?: (language: string) => void): CodeAnalysisResult {
	if (result.language && result.language !== 'Unknown' && onLanguageDetected) {
		onLanguageDetected(result.language)
	}
	return result
}

function handleGeneralResult(result: AnalysisResponse): GeneralAnalysisResult {
	return {
		content: result.code || 'No content extracted',
		type: 'General Analysis',
		response: result.summary || 'No analysis available',
		context: `Language: ${result.language || 'Unknown'}`,
	}
}

// Enhanced prompts for better AI analysis
const PROMPTS = {
	code: `You are an expert software engineer and code analyst. Analyze the code shown in these screenshots with precision and expertise.

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

If there are errors, bugs, or improvements possible, highlight them with solutions.`,

	general: `You are a highly intelligent assistant capable of understanding and analyzing any type of content from images with complete attention to detail.

Your systematic approach:
1. SCAN the entire image carefully - examine ALL text, elements, and context
2. IDENTIFY every piece of information present (questions, statements, diagrams, etc.)
3. UNDERSTAND the complete context and relationships between different parts
4. RESPOND comprehensively to ALL content found

CRITICAL: If there are MULTIPLE QUESTIONS or topics in the image:
- Address EVERY SINGLE question or topic - don't miss any
- Number your responses clearly (1., 2., 3., etc.)
- Provide complete answers for each item
- Maintain context between related questions

Content-specific handling:
- SINGLE QUESTION: Answer thoroughly with full context and examples
- MULTIPLE QUESTIONS: Answer ALL questions systematically, maintaining context
- TEXT/DOCUMENT: Extract and summarize ALL key points, don't miss details
- DIAGRAMS/CHARTS: Explain everything shown, all labels, relationships, and insights
- ERROR MESSAGES: Provide complete diagnosis and step-by-step solutions
- INSTRUCTIONS/PROCEDURES: Clarify ALL steps and provide additional helpful context
- MIXED CONTENT: Address each component separately but maintain overall coherence

Quality standards:
- Be exhaustively thorough - assume the user needs complete understanding
- Provide context and background when helpful
- Include examples, explanations, and clarifications
- Never skip or summarize away important details
- If something is unclear in the image, acknowledge it and provide best interpretation

Your goal: Ensure the user gets complete, accurate, and contextually rich information about EVERYTHING in the image.`
}

/**
 * Main analysis function - handles both code and general content analysis
 */
export async function analyzeContentFromImages(
	imagePaths: string[],
	customPrompt?: string,
	mode: AnalysisMode = 'code',
	previousContext?: string,
	onLanguageDetected?: (language: string) => void,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<CodeAnalysisResult | GeneralAnalysisResult> {
	const startTime = Date.now()
	logger.info(`Starting ${mode} analysis for ${imagePaths.length} images`)

	// Use enhanced prompts or custom prompt
	const prompt = customPrompt || PROMPTS[mode]

	// Default responses
	const defaults = {
		code: {
			code: 'Analysis failed or timed out',
			summary: 'Unable to complete analysis',
			timeComplexity: 'Unknown',
			spaceComplexity: 'Unknown',
			language: 'Unknown',
		} as CodeAnalysisResult,
		general: {
			content: 'Analysis failed',
			type: 'Error',
			response: 'Unable to complete analysis',
			context: 'Please try again',
		} as GeneralAnalysisResult
	}

	const defaultResponse = defaults[mode]

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
			return createErrorResponse(mode, 'No images provided', 'Please capture screenshots first')
		}

		// Process images
		const imageContents = await processImages(imagePaths)
		if (!imageContents.length) {
			logger.error('Image processing failed')
			clearTimeout(analysisTimeout)
			return createErrorResponse(mode, 'Failed to process images', 'Please check image files')
		}

		// Prepare and execute analysis
		const analysisRequest: AnalysisRequest = {
			images: imageContents,
			prompt,
			previousContext,
		}

		logger.info('Executing analysis', { model, provider: providerOverride, mode })
		const result = await analyzeCodeWithProvider(analysisRequest, model, providerOverride)

		// Handle results based on mode
		const finalResult = mode === 'code' 
			? handleCodeResult(result, onLanguageDetected)
			: handleGeneralResult(result)

		clearTimeout(analysisTimeout)
		logPerformance(`${mode} analysis completed`, startTime)
		return finalResult

	} catch (error) {
		logger.error('Analysis failed', { error: error instanceof Error ? error.message : String(error) })
		clearTimeout(analysisTimeout)

		const isServiceError = error instanceof Error && error.message.includes('API')
		const errorMsg = isServiceError ? 'AI service unavailable' : 'Analysis failed'
		const details = isServiceError ? 'Please check your API key' : 'Please try again'

		return createErrorResponse(mode, errorMsg, details)
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
		imagePaths, prompt, 'code', previousContext, onLanguageDetected, model, providerOverride
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
		})
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
	previousAnalysis: CodeAnalysisResult | GeneralAnalysisResult,
	newImagePaths: string[],
	mode: AnalysisMode = 'code',
	customPrompt?: string,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<CodeAnalysisResult | GeneralAnalysisResult> {
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
		const prompt = customPrompt || `${PROMPTS[mode]}

IMPORTANT: This is an extension of previous analysis. Incorporate the new image(s) with the existing analysis, updating or expanding as needed.`

		logger.info('Extending analysis', { newImages: newImagePaths.length, mode })
		return await analyzeContentFromImages(newImagePaths, prompt, mode, contextString, undefined, model, providerOverride)

	} catch (error) {
		logger.error('Extension failed', { error })
		
		// Return previous analysis with error note
		if (mode === 'code' && 'summary' in previousAnalysis) {
			return { ...previousAnalysis, summary: `${previousAnalysis.summary}

⚠️ Failed to extend with new image` }
		}
		if ('response' in previousAnalysis) {
			return { ...previousAnalysis, response: `${previousAnalysis.response}

⚠️ Failed to extend with new image` }
		}
		return previousAnalysis
	}
}