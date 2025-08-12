import * as fs from 'node:fs'
import { z } from 'zod'
import { createLogger, logPerformance } from '../lib/logger'
import { getMimeType, validateImageFile } from '../lib/utils'
import { type AnalysisRequest, type ImageContent, OpenAIService } from './openai/service'

// Define the schema for code analysis results
const codeAnalysisSchema = z.object({
	analysis: z.object({
		code: z.string().describe('The extracted code from the image'),
		summary: z.string().describe('A brief summary of what the code does'),
		timeComplexity: z.string().describe('The time complexity analysis of the code'),
		spaceComplexity: z.string().describe('The space complexity analysis of the code'),
		language: z.string().describe('The programming language detected in the image'),
	}),
})

// Type definition for the analysis result
export type CodeAnalysisResult = z.infer<typeof codeAnalysisSchema>['analysis']

// Create logger for code analyzer
const logger = createLogger('CodeAnalyzer')

/**
 * Analyzes code from screenshot images using the OpenAI service
 * Focuses on image processing and business logic, delegates API communication to service layer
 */
export async function analyzeCodeFromImages(
	imagePaths: string[],
	prompt: string = 'Analyze the images and solve the coding problem in them',
	previousContext?: string,
	onLanguageDetected?: (language: string) => void,
	model: string = 'gpt-4o',
): Promise<CodeAnalysisResult> {
	const startTime = Date.now()
	logger.info(`Starting code analysis for ${imagePaths.length} images`)
	logger.debug('Analysis request details', {
		imagePaths,
		promptLength: prompt.length,
		hasPreviousContext: !!previousContext,
	})

	// Default response in case of errors or timeouts
	const defaultResponse: CodeAnalysisResult = {
		code: 'Analysis in progress or timed out',
		summary: 'The analysis is taking longer than expected or encountered an error',
		timeComplexity: 'Unknown',
		spaceComplexity: 'Unknown',
		language: 'Unknown',
	}

	// Set a hard timeout for the entire analysis process
	const timeoutDuration = 60000 // 60 seconds for complex analysis
	const analysisTimeout = setTimeout(() => {
		logger.warn(`Analysis timeout triggered after ${timeoutDuration}ms`)
		return defaultResponse
	}, timeoutDuration)

	try {
		// Validate input
		if (!imagePaths || !imagePaths.length) {
			logger.error('No valid image paths provided')
			clearTimeout(analysisTimeout)
			return {
				code: 'No images provided for analysis',
				summary: 'Please capture screenshots to analyze',
				timeComplexity: 'N/A',
				spaceComplexity: 'N/A',
				language: 'N/A',
			}
		}

		logger.info(`Processing ${imagePaths.length} images`, { imagePaths })

		// Process images and convert to format expected by service
		const imageContents = await processImages(imagePaths)

		if (imageContents.length === 0) {
			logger.error('None of the images could be processed')
			clearTimeout(analysisTimeout)
			return {
				code: 'Failed to read image files',
				summary: 'Please make sure the image files are valid and accessible',
				timeComplexity: 'N/A',
				spaceComplexity: 'N/A',
				language: 'N/A',
			}
		}

		// Prepare request for service layer
		const analysisRequest: AnalysisRequest = {
			images: imageContents,
			prompt,
			previousContext,
		}

		// Create service instance with the specified model
		const serviceInstance = new OpenAIService({ model })
		
		// Call service layer for OpenAI communication
		logger.info('Delegating to OpenAI service...', { model })
		const result = await serviceInstance.analyzeCode(analysisRequest)

		// Notify about detected language
		if (result.language && result.language !== 'Unknown' && onLanguageDetected) {
			onLanguageDetected(result.language)
		}

		clearTimeout(analysisTimeout)
		logPerformance('Code analysis completed', startTime)

		return result
	} catch (error) {
		logger.error('Error in analysis workflow', {
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		clearTimeout(analysisTimeout)

		// Return a more specific error based on the error type
		if (error instanceof Error && error.message.includes('OpenAI API')) {
			return {
				code: 'OpenAI service unavailable',
				summary: 'The AI analysis service is currently unavailable. Please check your API key and try again.',
				timeComplexity: 'Analysis unavailable',
				spaceComplexity: 'Analysis unavailable',
				language: 'Unknown',
			}
		}

		return defaultResponse
	}
}

/**
 * Process image files and convert them to format expected by OpenAI service
 */
async function processImages(imagePaths: string[]): Promise<ImageContent[]> {
	logger.debug('Starting image file processing')
	const imageProcessingStart = Date.now()

	const imageContents = await Promise.all(
		imagePaths.map(async (path, index) => {
			try {
				logger.debug(`Processing image ${index + 1}/${imagePaths.length}`, { path })

				// Validate file
				const stats = await fs.promises.stat(path)
				logger.debug('Image file stats', { path, size: stats.size })

				const validation = validateImageFile(stats)
				if (!validation.isValid) {
					logger.error(validation.error || 'Image validation failed', { path })
					return null
				}

				// Read and convert image
				const imageBuffer = await fs.promises.readFile(path)
				const base64Image = imageBuffer.toString('base64')

				logger.debug('Image converted to base64', {
					path,
					base64Length: base64Image.length,
				})

				// Determine MIME type
				const mimeType = getMimeType(path)

				return {
					type: 'image_url' as const,
					image_url: {
						url: `data:${mimeType};base64,${base64Image}`,
					},
				}
			} catch (err) {
				logger.error('Failed to process image', {
					path,
					error: err instanceof Error ? err.message : String(err),
				})
				return null
			}
		}),
	)

	logPerformance('Image processing', imageProcessingStart)

	// Filter out failed image processing
	const validImages = imageContents.filter((img): img is ImageContent => img !== null)

	logger.info('Image processing summary', {
		validImages: validImages.length,
		totalImages: imagePaths.length,
	})

	return validImages
}

/**
 * Extends an existing code analysis with additional images
 * Uses the previous analysis as context for the new analysis
 */
export async function extendAnalysisWithImage(
	previousAnalysis: CodeAnalysisResult,
	newImagePaths: string[],
	prompt: string = 'Update the previous analysis with this additional image',
	model: string = 'gpt-4o',
): Promise<CodeAnalysisResult> {
	if (!newImagePaths || newImagePaths.length === 0) {
		logger.error('No image paths provided for extended analysis')
		return previousAnalysis // Return previous analysis if no new images
	}

	// Verify all images exist before proceeding
	try {
		for (const path of newImagePaths) {
			await fs.promises.access(path, fs.constants.R_OK)
			const stats = await fs.promises.stat(path)
			logger.debug('Verified image file for extension', { path, size: stats.size })

			const validation = validateImageFile(stats)
			if (!validation.isValid) {
				throw new Error(`${validation.error}: ${path}`)
			}
		}
	} catch (error) {
		logger.error('Error verifying image files for extension', {
			error: error instanceof Error ? error.message : String(error),
		})
		// Return previous analysis with a warning added to the summary
		return {
			...previousAnalysis,
			summary: `${previousAnalysis.summary}\n\nWarning: Could not process additional image(s).`,
		}
	}

	// Create context string from previous analysis
	const contextString = JSON.stringify({
		previousCode: previousAnalysis.code,
		previousSummary: previousAnalysis.summary,
		previousTimeComplexity: previousAnalysis.timeComplexity,
		previousSpaceComplexity: previousAnalysis.spaceComplexity,
		previousLanguage: previousAnalysis.language,
	})

	// Build a context-aware prompt
	const contextPrompt = `${prompt}. Incorporate this new information with the previous analysis. 
	If the new image provides additional context or corrects previous assumptions, please update 
	the analysis accordingly while maintaining relevant information from the previous analysis.`

	logger.info('Extending analysis with new images', {
		newImageCount: newImagePaths.length,
		contextLength: contextString.length,
	})

	try {
		// Call the main analysis function with the new image and context
		return await analyzeCodeFromImages(newImagePaths, contextPrompt, contextString, undefined, model)
	} catch (error) {
		logger.error('Error in extended analysis', {
			error: error instanceof Error ? error.message : String(error),
		})
		// If analysis fails, return the previous analysis with error indication
		return {
			...previousAnalysis,
			summary: `${previousAnalysis.summary}\n\nNote: Attempted to extend analysis with new image, but encountered an error: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}
