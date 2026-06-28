import * as fs from 'node:fs'
import { createLogger, logPerformance } from '../lib/logger'
import { getMimeType, validateImageFile } from '../lib/utils'
import { DEFAULT_PROGRAMMING_VISION_MODEL } from './openrouter/client'
import { type AnalysisRequest, type ImageContent, OpenRouterService } from './openrouter/service'

const logger = createLogger('SmartAnalyzer')

const TIMEOUT_MS = 60000

export const SMART_PROMPT = `You are CodeLens, an expert visual analyst. You receive one or more screenshots and must produce the single most useful response for the user.

STEP 1 — IDENTIFY what the screenshot actually contains. Pick the closest type:
  • CODE_PROBLEM    – Coding interview / algorithm / LeetCode-style question, possibly with examples.
  • CODE_SNIPPET    – Source code or a code editor view (no explicit problem statement).
  • ERROR_OR_BUG    – Stack trace, compiler/runtime error, console output, or buggy code.
  • QUESTION        – A non-code question: math, science, multiple choice, exam, quiz, homework.
  • DOCUMENT_TEXT   – Article, docs, slide, email, chat, or any prose text to read or summarize.
  • UI_DESIGN       – Application UI, mockup, website, dashboard, or design.
  • DIAGRAM_CHART   – Diagram, flowchart, graph, chart, table of data.
  • OTHER_IMAGE     – Photo or anything that doesn't fit above.

STEP 2 — RESPOND in Markdown using the structure for the type you picked. Do NOT label the type. Be concise but complete. No filler, no apologies, no "as an AI" preamble.

LANGUAGE RULE: Mirror the natural language of the screenshot (text, comments, problem statement). If mixed, pick the dominant one.

────────────────────────────────────────
TYPE-SPECIFIC TEMPLATES
────────────────────────────────────────

▸ CODE_PROBLEM
## Problem
One-paragraph restatement of the question.

## Solution
\`\`\`<lang>
// Complete, working, runnable solution
\`\`\`

## How it works
2–4 short bullets explaining the approach.

## Complexity
- **Time:** O(?) — why
- **Space:** O(?) — why

▸ CODE_SNIPPET
## Code
\`\`\`<lang>
// Cleanly transcribed code from the screenshot
\`\`\`

## What it does
2–4 bullets.

## Notes
Any bugs, smells, or improvements (omit section if none).

▸ ERROR_OR_BUG
## Error
Quote the key error message / symptom.

## Cause
Root cause in 1–2 sentences.

## Fix
\`\`\`<lang>
// Corrected code or exact command to run
\`\`\`
Short follow-up notes if needed.

▸ QUESTION
## Answer
Direct, final answer first (e.g. "**B) 42**").

## Reasoning
Steps that get there. Use math blocks when helpful.

▸ DOCUMENT_TEXT
## Summary
3–6 bullets capturing the key points.

## Key takeaways
Anything actionable, surprising, or worth remembering.

▸ UI_DESIGN
## What this is
1–2 sentences describing the screen and its purpose.

## Components
Bulleted list of the notable UI elements / sections visible.

## Observations
UX, accessibility, or visual issues worth flagging (omit if none).

▸ DIAGRAM_CHART
## What it shows
1–2 sentences.

## Key data points
Bulleted facts read from the chart/diagram.

## Insight
What the data implies (omit if purely descriptive).

▸ OTHER_IMAGE
## Description
A clear, factual description of the image content.

## Notable details
Bullets for anything specific worth pointing out.

────────────────────────────────────────
GENERAL RULES
- If multiple screenshots are provided, treat them as one continuous context.
- Always use proper Markdown: fenced code blocks with language, bold for emphasis, lists where useful.
- Never invent text that isn't in the image. If something is unreadable, say so briefly.
- Output ONLY the Markdown response — no JSON, no wrapper, no preface.`

export interface SmartAnalysisOptions {
	imagePaths: string[]
	previousContext?: string
	voiceContext?: string
	model?: string
}

export async function analyzeImagesSmart({
	imagePaths,
	previousContext,
	voiceContext,
	model = DEFAULT_PROGRAMMING_VISION_MODEL,
}: SmartAnalysisOptions): Promise<string> {
	const startTime = Date.now()

	const hasVoiceContext = !!voiceContext?.trim()
	if (!imagePaths?.length && !hasVoiceContext) {
		return '## No screenshots or voice context\nCapture at least one screenshot or record a voice note to analyze.'
	}

	const timeout = setTimeout(() => {
		logger.warn(`Smart analysis still running after ${TIMEOUT_MS}ms`)
	}, TIMEOUT_MS)

	try {
		const images = imagePaths.length ? await processImages(imagePaths) : []
		if (imagePaths.length > 0 && !images.length) {
			return '## Failed to read screenshots\nVerify the screenshot files and try again.'
		}

		logger.info('Executing smart analysis', {
			model,
			images: images.length,
			hasVoiceContext,
		})

		const request: AnalysisRequest = {
			images,
			prompt: buildAnalysisPrompt(voiceContext, images.length > 0),
			previousContext,
		}
		const markdown = await new OpenRouterService({ model }).analyze(request)

		logPerformance('Smart analysis completed', startTime)
		return markdown.trim() || '## Empty response\nThe model returned no content. Try again.'
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.error('Smart analysis failed', { error: message })
		return `## Analysis failed\n${message}\n\nCheck your API key and try again.`
	} finally {
		clearTimeout(timeout)
	}
}

function buildAnalysisPrompt(voiceContext?: string, hasImages = true): string {
	const trimmedVoiceContext = voiceContext?.trim()
	if (!trimmedVoiceContext) return SMART_PROMPT

	if (!hasImages) {
		return `You are CodeLens, an expert coding and technical assistant. The user provided a spoken request but no screenshots.

Respond directly in Markdown based only on the spoken context. Be concise but complete. If the request is ambiguous, state the likely interpretation and answer that. Do not mention screenshots unless the user asked about them.

USER SPOKEN CONTEXT
"""
${trimmedVoiceContext}
"""`
	}

	return `${SMART_PROMPT}

USER SPOKEN CONTEXT
The user recorded this voice note to guide the screenshot analysis. Treat it as the user's intent, constraints, and preferred approach. If it conflicts with the screenshot, explain the conflict briefly and prioritize facts visible in the screenshot.

"""
${trimmedVoiceContext}
"""`
}

async function processImages(imagePaths: string[]): Promise<ImageContent[]> {
	const results = await Promise.all(
		imagePaths.map(async (path) => {
			try {
				const stats = await fs.promises.stat(path)
				const validation = validateImageFile(stats)
				if (!validation.isValid) {
					logger.error('Invalid image', { path, error: validation.error })
					return null
				}

				const buffer = await fs.promises.readFile(path)
				return {
					type: 'image_url' as const,
					image_url: { url: `data:${getMimeType(path)};base64,${buffer.toString('base64')}` },
				}
			} catch (error) {
				logger.error('Image processing failed', { path, error })
				return null
			}
		}),
	)

	return results.filter((img): img is ImageContent => img !== null)
}
