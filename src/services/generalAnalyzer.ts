import { createLogger, logPerformance } from '../lib/logger'
import {
	buildErrorMessage,
	createTimeoutHandler,
	validateImagePaths,
	validateProcessedImages,
} from './baseAnalyzer'
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

// Default error response
const ERROR_RESPONSE: GeneralAnalysisResult = {
	answer: 'Analysis failed or timed out',
	explanation: 'Unable to complete analysis',
	test: 'No test generated',
}

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

	const timer = createTimeoutHandler(ERROR_RESPONSE, 'General analysis')

	try {
		if (!validateImagePaths(imagePaths, timer)) {
			timer.clear()
			return createErrorResponse('No images provided', 'Capture at least one screenshot to analyze')
		}

		const imageContents = await processImages(imagePaths)
		if (!validateProcessedImages(imageContents, timer, 'General analysis image processing failed')) {
			timer.clear()
			return createErrorResponse('Failed to process images', 'Verify screenshot files and try again')
		}

		const analysisRequest: AnalysisRequest = {
			images: imageContents,
			prompt,
			previousContext,
		}

		logger.info('Executing general analysis', { model, provider: providerOverride })
		const result: GeneralAnalysisResponse = await analyzeGeneralWithProvider(analysisRequest, model, providerOverride)

		timer.clear()
		logPerformance('General analysis completed', startTime)

		return {
			answer: result.answer,
			explanation: result.explanation,
			test: result.test,
		}
	} catch (error) {
		timer.clear()
		const { message, details } = buildErrorMessage(error)
		return createErrorResponse(message, details)
	}
}
