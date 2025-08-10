import * as fs from 'node:fs'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { createLogger, logApiCall, logPerformance } from './logger'

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

// Check if OpenAI API key is configured
function isOpenAIConfigured(): boolean {
	const hasKey = !!process.env.OPENAI_API_KEY
	const isValidFormat = process.env.OPENAI_API_KEY?.startsWith('sk-') ?? false

	logger.debug('API Key configuration check', { hasKey, isValidFormat })
	return hasKey && isValidFormat
}

/**
 * Analyzes code from screenshot images
 * Enhanced with better logging, improved model, and performance optimizations
 */
export async function analyzeCodeFromImages(
	imagePaths: string[],
	prompt: string = 'Analyze the images and solve the coding problem in them',
	previousContext?: string,
	onLanguageDetected?: (language: string) => void,
): Promise<CodeAnalysisResult> {
	const _startTime = Date.now()
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

	// Set a hard timeout for the entire analysis process (increased for better results)
	const timeoutDuration = 60000 // 60 seconds for complex analysis
	const analysisTimeout = setTimeout(() => {
		logger.warn(`Analysis timeout triggered after ${timeoutDuration}ms`)
		return defaultResponse
	}, timeoutDuration)

	try {
		// Check if we have valid image paths
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

		try {
			// Check if OpenAI API key is configured properly
			if (!isOpenAIConfigured()) {
				logger.error('OpenAI API key is not configured')
				return {
					code: 'OpenAI API key not configured',
					summary: 'Please add your OPENAI_API_KEY to the .env file or environment variables',
					timeComplexity: 'N/A',
					spaceComplexity: 'N/A',
					language: 'N/A',
				}
			}

			// Read the image files and convert them to base64 format
			logger.debug('Starting image file processing')
			const imageProcessingStart = Date.now()

			const imageContents = await Promise.all(
				imagePaths.map(async (path, index) => {
					try {
						logger.debug(`Processing image ${index + 1}/${imagePaths.length}`, {
							path,
						})

						// Check file exists and get stats
						const stats = await fs.promises.stat(path)
						logger.debug('Image file processed', { path, size: stats.size })

						if (stats.size === 0) {
							logger.error(`Image file is empty`, { path })
							return null
						}

						if (stats.size > 20 * 1024 * 1024) {
							// 20MB limit
							logger.warn(`Image file too large`, { path, size: stats.size })
							return null
						}

						// Read the image file as a buffer
						const imageBuffer = await fs.promises.readFile(path)
						// Convert the buffer to a base64 string
						const base64Image = imageBuffer.toString('base64')
						logger.debug('Image converted to base64', {
							path,
							base64Length: base64Image.length,
						})

						// Get the file extension to determine the MIME type
						const fileExtension = path.split('.').pop()?.toLowerCase()
						let mimeType = 'image/png' // Default to png

						// Set appropriate MIME type based on extension
						if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
							mimeType = 'image/jpeg'
						} else if (fileExtension === 'gif') {
							mimeType = 'image/gif'
						} else if (fileExtension === 'webp') {
							mimeType = 'image/webp'
						}

						return {
							type: 'image_url' as const,
							image_url: {
								url: `data:${mimeType};base64,${base64Image}`,
							},
						}
					} catch (err) {
						logger.error('Failed to read image', {
							path,
							error: err instanceof Error ? err.message : String(err),
						})
						return null
					}
				}),
			)

			const _imageProcessingTime = Date.now() - imageProcessingStart
			logPerformance('Image processing', imageProcessingStart)

			// Filter out any null values from failed image loads
			const validImages = imageContents.filter(
				(img): img is { type: 'image_url'; image_url: { url: string } } => img !== null,
			)

			logger.info('Image processing summary', {
				validImages: validImages.length,
				totalImages: imagePaths.length,
			})

			if (validImages.length === 0) {
				logger.error('None of the images could be read')
				clearTimeout(analysisTimeout)
				return {
					code: 'Failed to read image files',
					summary: 'Please make sure the image files are valid and accessible',
					timeComplexity: 'N/A',
					spaceComplexity: 'N/A',
					language: 'N/A',
				}
			}

			// Create enhanced prompt with structured output request focused on code results
			const enhancedPrompt = `
You are an expert software engineer and problem solver. Your primary goal is to extract, analyze, and SOLVE coding problems from screenshots.

Task: ${prompt}
${previousContext ? `\nPrevious context: ${previousContext}` : ''}

CRITICAL INSTRUCTIONS - Follow this order:
1. EXTRACT: Transcribe ALL visible code exactly as shown, including comments, variable names, and syntax
2. IDENTIFY: Determine the programming language and any visible problems/requirements
3. SOLVE: If there's a coding problem, interview question, or bug - provide the COMPLETE WORKING SOLUTION
4. ANALYZE: Explain complexity and functionality

Provide your response in this exact JSON format:
{
  "code": "COMPLETE extracted code from image(s) + WORKING SOLUTION if problem exists. Include full implementation, not just snippets. If solving a problem, provide the entire corrected/completed code.",
  "summary": "What the code does + Problem identified + Solution approach + Key insights for implementation",
  "timeComplexity": "Big O analysis with explanation (e.g., O(n log n) due to sorting algorithm)",
  "spaceComplexity": "Memory usage analysis with explanation (e.g., O(n) for auxiliary array)",
  "language": "Programming language (python, javascript, java, cpp, etc.)"
}

PRIORITY FOCUS:
- If you see a coding interview question → Provide complete working solution
- If you see buggy code → Provide fixed version with explanation
- If you see incomplete code → Provide completed implementation
- If you see algorithm challenge → Provide optimized solution with edge cases handled
- Always include FULL working code, not pseudocode or partial solutions
      `

			// Create the content array with the enhanced prompt and images
			const content = [
				{
					type: 'text' as const,
					text: enhancedPrompt,
				},
				...validImages,
			]

			logger.debug('Preparing OpenAI API call', {
				imageCount: validImages.length,
				promptLength: enhancedPrompt.length,
			})

			// Create a direct OpenAI client for vision API
			const openaiClient = new OpenAI({
				apiKey: process.env.OPENAI_API_KEY,
				timeout: 50000, // 50 second timeout for API calls
			})

			const apiCallStart = Date.now()
			logger.info('Calling OpenAI API...')

			// Call the OpenAI API with the images using the latest model
			const response = await openaiClient.chat.completions.create({
				model: 'gpt-4o-2024-08-06', // Latest GPT-4o model
				messages: [
					{
						role: 'system',
						content:
							'You are an expert software engineer and code analyst. Always respond with accurate, detailed code analysis in the requested JSON format.',
					},
					{
						role: 'user',
						content: content,
					},
				],
				max_tokens: 2000, // Increased for more detailed analysis
				temperature: 0.1, // Lower temperature for more consistent results
				response_format: { type: 'json_object' }, // Request JSON format
			})

			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 200, apiCallTime, {
				model: 'gpt-4o-2024-08-06',
				imageCount: validImages.length,
			})

			const responseText = response.choices[0]?.message.content || ''
			logger.debug('OpenAI response received', {
				responseLength: responseText.length,
				hasContent: !!responseText,
			})

			// Try to parse the response as JSON
			try {
				// Look for JSON in the response - it might be embedded in markdown code blocks
				let jsonStr = responseText

				// Try to find JSON in code blocks
				const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
				if (jsonMatch?.[1]) {
					jsonStr = jsonMatch[1]
				}

				// Try to detect if this is JSON already or needs to be structured
				let analysis: CodeAnalysisResult

				if (jsonStr.trim().startsWith('{')) {
					// Try to parse as direct JSON
					try {
						const parsed = JSON.parse(jsonStr)
						analysis = {
							code: parsed.code || '',
							summary: parsed.summary || '',
							timeComplexity: parsed.timeComplexity || 'O(?)',
							spaceComplexity: parsed.spaceComplexity || 'O(?)',
							language: parsed.language || 'Unknown',
						}

						// Notify about detected language
						if (analysis.language && analysis.language !== 'Unknown' && onLanguageDetected) {
							onLanguageDetected(analysis.language)
						}
					} catch (_e) {
						// If JSON parsing fails, create a structured response from the text
						analysis = {
							code: extractCodeFromText(responseText),
							summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
							timeComplexity: extractComplexity(responseText, 'time') || 'Not provided',
							spaceComplexity: extractComplexity(responseText, 'space') || 'Not provided',
							language: extractLanguage(responseText) || 'Unknown',
						}
					}
				} else {
					// No JSON found, create a structured response
					analysis = {
						code: extractCodeFromText(responseText),
						summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
						timeComplexity: extractComplexity(responseText, 'time') || 'Not provided',
						spaceComplexity: extractComplexity(responseText, 'space') || 'Not provided',
						language: extractLanguage(responseText) || 'Unknown',
					}
				}

				clearTimeout(analysisTimeout)
				return analysis
			} catch (error) {
				logger.error('Error processing OpenAI response', {
					error: error instanceof Error ? error.message : String(error),
				})
				clearTimeout(analysisTimeout)

				// Try to extract useful information from the text response
				return {
					code: extractCodeFromText(responseText) || 'Code extraction failed',
					summary: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''),
					timeComplexity: extractComplexity(responseText, 'time') || 'Not identified',
					spaceComplexity: extractComplexity(responseText, 'space') || 'Not identified',
					language: extractLanguage(responseText) || 'Unknown',
				}
			}
		} catch (error) {
			logger.error('AI analysis error', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Provide a more helpful fallback response
			clearTimeout(analysisTimeout)
			return {
				code: 'The analysis service is currently unavailable',
				summary: 'Please try again in a moment. The AI service might be experiencing high demand.',
				timeComplexity: 'Analysis unavailable',
				spaceComplexity: 'Analysis unavailable',
				language: 'Unknown',
			}
		}
	} catch (error) {
		logger.error('Error in analysis workflow', {
			error: error instanceof Error ? error.message : 'Unknown error',
		})
		clearTimeout(analysisTimeout)
		return defaultResponse
	}
}

/**
 * Extends an existing code analysis with additional images
 * Uses the previous analysis as context for the new analysis
 */
export async function extendAnalysisWithImage(
	previousAnalysis: CodeAnalysisResult,
	newImagePaths: string[],
	prompt: string = 'Update the previous analysis with this additional image',
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
			logger.debug('Verified image file', { path, size: stats.size })
			if (stats.size === 0) {
				throw new Error(`Image file is empty: ${path}`)
			}
		}
	} catch (error) {
		logger.error('Error verifying image files', {
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
		return await analyzeCodeFromImages(newImagePaths, contextPrompt, contextString)
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

// Helper function to extract code blocks from text
function extractCodeFromText(text: string): string {
	const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/g
	let extractedCode = ''

	let currentMatch = codeBlockRegex.exec(text)
	while (currentMatch !== null) {
		extractedCode += `${currentMatch[1]}\n\n`
		currentMatch = codeBlockRegex.exec(text)
	}

	return extractedCode.trim() || text.substring(0, 500)
}

// Helper function to extract complexity information from text
function extractComplexity(text: string, type: 'time' | 'space'): string | null {
	const complexityRegex = new RegExp(`${type}\\s*complexity[\\s:]*([^\\n.]+)`, 'i')
	const match = text.match(complexityRegex)
	return match ? match[1].trim() : null
}

// Helper function to extract programming language from text
function extractLanguage(text: string): string | null {
	// Common language patterns
	const languageRegex = /language[:\s]+(\w+)/i
	const codeBlockRegex = /```(\w+)/

	// Try to find explicit language mention
	const langMatch = text.match(languageRegex)
	if (langMatch?.[1]) {
		return langMatch[1]
	}

	// Try to infer from code block
	const codeMatch = text.match(codeBlockRegex)
	if (codeMatch?.[1] && codeMatch[1].toLowerCase() !== 'json') {
		return codeMatch[1]
	}

	return null
}
