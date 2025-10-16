import { createLogger, logPerformance } from '../lib/logger'
import { processImages } from './codeAnalyzer'
import type { AnalysisRequest, GeneralAnalysisResponse } from './openrouter/service'
import { analyzeGeneralWithProvider, type Provider } from './providers'

export type GeneralAnalysisResult = {
	answer: string
	explanation: string
	test: string
}

const logger = createLogger('GeneralAnalyzer')

const GENERAL_PROMPT =
	`You are an expert problem solver and educator. Review the provided screenshot(s) and deliver a precise response.

Your responsibilities:
1. IDENTIFY the questions or tasks in the images.
2. SOLVE them completely and accurately.
3. ANALYZE your approach with clear reasoning.
4. DESIGN a verification test plan that proves the solution is correct.
5. COMMUNICATE using the same natural language used in the questions or text shown. When multiple languages appear, choose the primary language for your response.

Respond ONLY in JSON with this exact shape:
{
  "answer": "Complete solution with clear, actionable steps or final answer.",
  "explanation": "Concise analysis covering the key reasoning, methodology, and approach.",
  "test": "Detailed test plan, verification steps, or validation checklist to confirm correctness."
}`.trim()

function createErrorResponse(error: string, details: string): GeneralAnalysisResult {
	return {
		answer: error,
		explanation: details,
		test: 'No test available',
	}
}

export async function analyzeGeneralContentFromImages(
	imagePaths: string[],
	customPrompt?: string,
	previousContext?: string,
	model: string = 'gpt-4o',
	providerOverride?: Provider,
): Promise<GeneralAnalysisResult> {
	const startTime = Date.now()
	logger.info(`Starting general analysis for ${imagePaths.length} images`)

	const prompt = customPrompt || GENERAL_PROMPT

	const defaultResponse: GeneralAnalysisResult = {
		answer: 'Analysis failed or timed out',
		explanation: 'Unable to complete analysis',
		test: 'No test generated',
	}

	const timeoutDuration = 60000
	const analysisTimeout = setTimeout(() => {
		logger.warn(`General analysis timeout after ${timeoutDuration}ms`)
		return defaultResponse
	}, timeoutDuration)

	try {
		if (!imagePaths?.length) {
			logger.error('No image paths provided for general analysis')
			clearTimeout(analysisTimeout)
			return createErrorResponse('No images provided', 'Capture at least one screenshot to analyze')
		}

		const imageContents = await processImages(imagePaths)
		if (!imageContents.length) {
			logger.error('General analysis image processing failed')
			clearTimeout(analysisTimeout)
			return createErrorResponse('Failed to process images', 'Verify screenshot files and try again')
		}

		const analysisRequest: AnalysisRequest = {
			images: imageContents,
			prompt,
			previousContext,
		}

		logger.info('Executing general analysis', { model, provider: providerOverride })
		const result: GeneralAnalysisResponse = await analyzeGeneralWithProvider(analysisRequest, model, providerOverride)

		clearTimeout(analysisTimeout)
		logPerformance('General analysis completed', startTime)

		return {
			answer: result.answer,
			explanation: result.explanation,
			test: result.test,
		}
	} catch (error) {
		logger.error('General analysis failed', { error: error instanceof Error ? error.message : String(error) })
		clearTimeout(analysisTimeout)

		const isServiceError = error instanceof Error && error.message.includes('API')
		const errorMsg = isServiceError ? 'AI service unavailable' : 'Analysis failed'
		const details = isServiceError ? 'Check your API key and provider availability' : 'Please try again'

		return createErrorResponse(errorMsg, details)
	}
}
