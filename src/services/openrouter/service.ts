import { createLogger, logApiCall } from '../../lib/logger'
import { createOpenRouterClient, validateOpenRouterConfiguration } from './client'

const logger = createLogger('OpenRouterService')

// Pre-compiled regex patterns (module-level for shared access)
const JSON_BLOCK_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/

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

export interface GeneralAnalysisResponse {
	answer: string
	explanation: string
	test: string
}
export interface OpenRouterServiceOptions {
	model?: string
	maxTokens?: number
	temperature?: number
	timeout?: number
}

/**
 * Extract JSON from markdown code blocks and parse it
 * Returns null if parsing fails
 */
function extractAndParseJson<T>(responseText: string, loggerName: string): T | null {
	let jsonStr = responseText

	// Try to find JSON in code blocks
	const jsonMatch = responseText.match(JSON_BLOCK_REGEX)
	if (jsonMatch?.[1]) {
		jsonStr = jsonMatch[1]
	}

	// Try to parse as direct JSON
	if (jsonStr.trim().startsWith('{')) {
		try {
			return JSON.parse(jsonStr) as T
		} catch (jsonError) {
			const localLogger = createLogger(loggerName)
			localLogger.warn('JSON parsing failed, falling back to text extraction', {
				error: jsonError instanceof Error ? jsonError.message : String(jsonError),
			})
		}
	}

	return null
}

/**
 * Service for handling OpenRouter API communication and response processing
 * Uses OpenRouter to access OpenAI models via their API
 */
export class OpenRouterService {
	// Pre-compiled regex patterns for performance
	private static readonly CODE_BLOCK_REGEX = /```(?:\w+)?\s*([\s\S]*?)\s*```/g
	private static readonly LANGUAGE_REGEX = /language[:\s]+(\w+)/i
	private static readonly CODE_BLOCK_LANG_REGEX = /```(\w+)/

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
	 * Analyze general questions or content from images using OpenRouter
	 */
	async analyzeGeneral(request: AnalysisRequest): Promise<GeneralAnalysisResponse> {
		validateOpenRouterConfiguration()

		const client = createOpenRouterClient()
		const enhancedPrompt = this.buildGeneralPrompt(request.prompt, request.previousContext)

		const content = [
			{
				type: 'text' as const,
				text: enhancedPrompt,
			},
			...request.images,
		]

		logger.debug('Preparing OpenRouter general analysis call', {
			imageCount: request.images.length,
			promptLength: enhancedPrompt.length,
			model: this.options.model,
		})

		const apiCallStart = Date.now()
		logger.info('Calling OpenRouter API for general analysis...')

		try {
			const response = await client.chat.completions.create({
				model: this.options.model,
				messages: [
					{
						role: 'system',
						content:
							'You are an expert analyst and educator. Always respond with concise reasoning and a verification plan in the requested JSON format.',
					},
					{
						role: 'user',
						content,
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
				mode: 'general',
			})

			const responseText = response.choices[0]?.message.content || ''
			logger.debug('OpenRouter general response received', {
				responseLength: responseText.length,
				hasContent: !!responseText,
			})

			return this.parseGeneralResponse(responseText)
		} catch (error) {
			const apiCallTime = Date.now() - apiCallStart
			logApiCall('POST', '/chat/completions', 500, apiCallTime, {
				provider: 'openrouter',
				model: this.options.model,
				mode: 'general',
				error: error instanceof Error ? error.message : String(error),
			})

			logger.error('OpenRouter general analysis failed', {
				error: error instanceof Error ? error.message : String(error),
				duration: apiCallTime,
			})

			throw new Error(`OpenRouter general analysis failed: ${error instanceof Error ? error.message : String(error)}`)
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

LANGUAGE REQUIREMENT:
- Mirror the natural language used in the screenshot text, problem statement, or code comments when writing the summary and explanations. If multiple languages appear, choose the dominant one.

PRIORITY FOCUS:
- If you see a coding interview question → Provide complete working solution
- If you see buggy code → Provide fixed version with explanation
- If you see incomplete code → Provide completed implementation
- If you see algorithm challenge → Provide optimized solution with edge cases handled
- Always include FULL working code, not pseudocode or partial solutions
		`.trim()
	}

	private buildGeneralPrompt(prompt: string, previousContext?: string): string {
		return `
You are a senior analyst. Study the screenshot content, solve every question inside, and design a verification test.

Task: ${prompt}
${previousContext ? `\nPrevious context: ${previousContext}` : ''}

Respond ONLY in JSON with this schema:
{
  "answer": "Complete solution to every question in the images. Be direct.",
  "explanation": "Brief reasoning describing how you reached the answer.",
  "test": "Concrete verification. Provide a runnable test case, QA script, or step-by-step checklist that proves the answer."
}

LANGUAGE REQUIREMENT:
- Use the same natural language found in the questions or text from the screenshots when providing the answer, explanation, and test. If multiple languages appear, respond in the dominant one.

Keep the explanation concise and the test thorough enough to validate the answer end-to-end.
		`.trim()
	}

	/**
	 * Parse OpenRouter response and extract structured analysis
	 */
	private parseResponse(responseText: string): AnalysisResponse {
		try {
			// Try to extract and parse JSON from markdown code blocks
			const parsed = extractAndParseJson<{
				code?: string
				summary?: string
				timeComplexity?: string
				spaceComplexity?: string
				language?: string
			}>(responseText, 'OpenRouterService')

			if (parsed) {
				return {
					code: parsed.code || '',
					summary: parsed.summary || '',
					timeComplexity: parsed.timeComplexity || 'O(?)',
					spaceComplexity: parsed.spaceComplexity || 'O(?)',
					language: parsed.language || 'Unknown',
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

	private parseGeneralResponse(responseText: string): GeneralAnalysisResponse {
		try {
			// Try to extract and parse JSON from markdown code blocks
			const parsed = extractAndParseJson<{
				answer?: string
				explanation?: string
				test?: string
			}>(responseText, 'OpenRouterService')

			if (parsed) {
				return {
					answer: parsed.answer || '',
					explanation: parsed.explanation || '',
					test: parsed.test || '',
				}
			}

			return this.extractGeneralFromText(responseText)
		} catch (error) {
			logger.error('Error processing general response', {
				error: error instanceof Error ? error.message : String(error),
			})

			return this.extractGeneralFromText(responseText)
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
		let extractedCode = ''

		let currentMatch = OpenRouterService.CODE_BLOCK_REGEX.exec(text)
		while (currentMatch !== null) {
			extractedCode += `${currentMatch[1]}\n\n`
			currentMatch = OpenRouterService.CODE_BLOCK_REGEX.exec(text)
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
		// Try to find explicit language mention
		const langMatch = text.match(OpenRouterService.LANGUAGE_REGEX)
		if (langMatch?.[1]) {
			return langMatch[1]
		}

		// Try to infer from code block
		const codeMatch = text.match(OpenRouterService.CODE_BLOCK_LANG_REGEX)
		if (codeMatch?.[1] && codeMatch[1].toLowerCase() !== 'json') {
			return codeMatch[1]
		}

		return null
	}

	private extractGeneralFromText(text: string): GeneralAnalysisResponse {
		return {
			answer: this.extractGeneralSection(text, ['answer', 'solution', 'response']) || text.substring(0, 200),
			explanation:
				this.extractGeneralSection(text, ['explanation', 'reason', 'rationale']) || 'Explanation unavailable',
			test: this.extractGeneralSection(text, ['test', 'verification', 'checklist']) || 'No verification test provided',
		}
	}

	private extractGeneralSection(text: string, keywords: string[]): string | null {
		const pattern = new RegExp(`(?:${keywords.join('|')})\\s*[:\\-]\\s*([\\s\\S]*?)(?:\\n\\n|$)`, 'i')
		const match = text.match(pattern)
		if (match?.[1]) {
			return match[1].trim()
		}
		return null
	}
}

// Export singleton instance for convenience
export const openRouterService = new OpenRouterService()
