import { createLogger, logApiCall } from '../../lib/logger'
import { createOpenRouterClient, validateOpenRouterConfiguration } from './client'

const logger = createLogger('OpenRouterService')

// Types for service layer (reusing from OpenAI service)
export interface ImageContent {
	type: 'image_url'
	image_url: {
		url: string
	}
}

export interface AnalysisRequest {
	images: ImageContent[]
	prompt: string
	previousContext?: string
}

export interface AnalysisResponse {
	code: string
	summary: string
	timeComplexity: string
	spaceComplexity: string
	language: string
}

export interface OpenRouterServiceOptions {
	model?: string
	maxTokens?: number
	temperature?: number
	timeout?: number
}

/**
 * Service for handling OpenRouter API communication and response processing
 * Uses OpenRouter to access OpenAI models via their API
 */
export class OpenRouterService {
	private readonly options: Required<OpenRouterServiceOptions>

	constructor(options: OpenRouterServiceOptions = {}) {
		this.options = {
			model: options.model || 'openai/gpt-4o',
			maxTokens: options.maxTokens || 2000,
			temperature: options.temperature || 0.1,
			timeout: options.timeout || 50000,
		}
	}

	/**
	 * Analyze code from images using OpenRouter API (OpenAI models)
	 */
	async analyzeCode(request: AnalysisRequest): Promise<AnalysisResponse> {
		// Validate configuration before making API call
		validateOpenRouterConfiguration()

		const client = createOpenRouterClient()

		// Build enhanced prompt
		const enhancedPrompt = this.buildAnalysisPrompt(request.prompt, request.previousContext)

		// Prepare content for API call
		const content = [
			{
				type: 'text' as const,
				text: enhancedPrompt,
			},
			...request.images,
		]

		logger.debug('Preparing OpenRouter API call', {
			imageCount: request.images.length,
			promptLength: enhancedPrompt.length,
			model: this.options.model,
		})

		const apiCallStart = Date.now()
		logger.info('Calling OpenRouter API...')

		try {
			// Make API call through OpenRouter
			const response = await client.chat.completions.create({
				model: this.options.model,
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
				max_tokens: this.options.maxTokens,
				temperature: this.options.temperature,
				response_format: { type: 'json_object' },
			})

			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 200, apiCallTime, {
				provider: 'openrouter',
				model: this.options.model,
				imageCount: request.images.length,
			})

			const responseText = response.choices[0]?.message.content || ''
			logger.debug('OpenRouter response received', {
				responseLength: responseText.length,
				hasContent: !!responseText,
			})

			// Parse and return structured response
			return this.parseResponse(responseText)
		} catch (error) {
			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 500, apiCallTime, {
				provider: 'openrouter',
				model: this.options.model,
				error: error instanceof Error ? error.message : String(error),
			})

			logger.error('OpenRouter API call failed', {
				error: error instanceof Error ? error.message : String(error),
				duration: apiCallTime,
			})

			throw new Error(`OpenRouter API call failed: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * Build enhanced prompt for code analysis
	 */
	private buildAnalysisPrompt(prompt: string, previousContext?: string): string {
		return `
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
		`.trim()
	}

	/**
	 * Parse OpenRouter response and extract structured analysis
	 */
	private parseResponse(responseText: string): AnalysisResponse {
		try {
			// Look for JSON in the response - it might be embedded in markdown code blocks
			let jsonStr = responseText

			// Try to find JSON in code blocks
			const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
			if (jsonMatch?.[1]) {
				jsonStr = jsonMatch[1]
			}

			// Try to parse as direct JSON
			if (jsonStr.trim().startsWith('{')) {
				try {
					const parsed = JSON.parse(jsonStr)
					return {
						code: parsed.code || '',
						summary: parsed.summary || '',
						timeComplexity: parsed.timeComplexity || 'O(?)',
						spaceComplexity: parsed.spaceComplexity || 'O(?)',
						language: parsed.language || 'Unknown',
					}
				} catch (jsonError) {
					logger.warn('JSON parsing failed, falling back to text extraction', {
						error: jsonError instanceof Error ? jsonError.message : String(jsonError),
					})
				}
			}

			// Fallback: extract information from text
			return this.extractFromText(responseText)
		} catch (error) {
			logger.error('Error processing OpenRouter response', {
				error: error instanceof Error ? error.message : String(error),
			})

			// Return fallback response with extracted text
			return this.extractFromText(responseText)
		}
	}

	/**
	 * Extract structured information from plain text response
	 */
	private extractFromText(text: string): AnalysisResponse {
		return {
			code: this.extractCodeFromText(text) || 'Code extraction failed',
			summary: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
			timeComplexity: this.extractComplexity(text, 'time') || 'Not identified',
			spaceComplexity: this.extractComplexity(text, 'space') || 'Not identified',
			language: this.extractLanguage(text) || 'Unknown',
		}
	}

	/**
	 * Extract code blocks from text
	 */
	private extractCodeFromText(text: string): string {
		const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)\s*```/g
		let extractedCode = ''

		let currentMatch = codeBlockRegex.exec(text)
		while (currentMatch !== null) {
			extractedCode += `${currentMatch[1]}\n\n`
			currentMatch = codeBlockRegex.exec(text)
		}

		return extractedCode.trim() || text.substring(0, 500)
	}

	/**
	 * Extract complexity information from text
	 */
	private extractComplexity(text: string, type: 'time' | 'space'): string | null {
		const complexityRegex = new RegExp(`${type}\\s*complexity[\\s:]*([^\\n.]+)`, 'i')
		const match = text.match(complexityRegex)
		return match ? match[1].trim() : null
	}

	/**
	 * Extract programming language from text
	 */
	private extractLanguage(text: string): string | null {
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
}

// Export singleton instance for convenience
export const openRouterService = new OpenRouterService()
