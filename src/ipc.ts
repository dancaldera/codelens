export const IPC_CHANNELS = {
	SUBMIT_PROMPT: 'submit-prompt',
	SCREENSHOT_STATUS: 'screenshot-status',
	ANALYSIS_RESULT: 'analysis-result',
	CONTEXT_RESET: 'context-reset',
	SUBMIT_RESULT: 'submit-result',
	REQUEST_SCREENSHOT: 'request-screenshot',
	SCREENSHOT_IMAGE: 'screenshot-image',
	CLEAR_SCREENSHOTS: 'clear-screenshots',
	OPEN_SCREENSHOT: 'open-screenshot',
	GET_PROMPT: 'get-prompt',
	PROMPT_RESPONSE: 'prompt-response',
	SHOW_LOADING: 'show-loading',
	LANGUAGE_DETECTED: 'language-detected',
	MODEL_CHANGED: 'model-changed',
	MODELS_LOADING: 'models-loading',
	RESIZE_WINDOW: 'resize-window',
	TRIGGER_SCREENSHOT: 'trigger-screenshot',
} as const

export interface ResizeWindowPayload {
	width: number
	height: number
}

export interface ScreenshotImagePayload {
	index: number
	data: string
	path: string
}

export interface ModelChangedPayload {
	provider: string
	model: string
}

export function isValidResizeWindowPayload(payload: unknown): payload is ResizeWindowPayload {
	if (!payload || typeof payload !== 'object') return false

	const { width, height } = payload as Partial<ResizeWindowPayload>
	return (
		isFinitePositiveNumber(width) &&
		isFinitePositiveNumber(height) &&
		width >= 300 &&
		height >= 200 &&
		width <= 4000 &&
		height <= 4000
	)
}

export function isValidScreenshotIndex(index: unknown, maxScreenshots = 2): index is number {
	return Number.isInteger(index) && Number(index) >= 1 && Number(index) <= maxScreenshots
}

function isFinitePositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
}
