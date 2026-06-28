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
	HIDE_LOADING: 'hide-loading',
	LANGUAGE_DETECTED: 'language-detected',
	MODEL_CHANGED: 'model-changed',
	MODELS_LOADING: 'models-loading',
	GET_CURRENT_MODEL: 'get-current-model',
	STT_MODEL_CHANGED: 'stt-model-changed',
	STT_MODELS_LOADING: 'stt-models-loading',
	GET_CURRENT_STT_MODEL: 'get-current-stt-model',
	TOGGLE_VOICE_RECORDING: 'toggle-voice-recording',
	VOICE_AUDIO_RECORDED: 'voice-audio-recorded',
	VOICE_STATUS: 'voice-status',
	VOICE_TRANSCRIPT_READY: 'voice-transcript-ready',
	VOICE_CAPTURE_STATE: 'voice-capture-state',
	RESIZE_WINDOW: 'resize-window',
	TRIGGER_SCREENSHOT: 'trigger-screenshot',
} as const

export type LoadingState = 'waiting' | 'recording' | 'transcribing' | 'analyzing'

export interface LoadingStatusPayload {
	state: LoadingState
	title: string
	message?: string
}

export type VoiceCaptureState = 'idle' | 'recording' | 'processing' | 'error'

export interface VoiceCaptureStatePayload {
	state: VoiceCaptureState
}

export interface ResizeWindowPayload {
	width: number
	height: number
}

export interface ScreenshotImagePayload {
	index: number
	data: string
	path: string
}

export interface VoiceAudioPayload {
	data: string
	mimeType: string
	durationMs: number
}

export interface ModelChangedPayload {
	provider: string
	model: string
	index?: number
	count?: number
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

export function isValidLoadingStatusPayload(payload: unknown): payload is LoadingStatusPayload {
	if (!payload || typeof payload !== 'object') return false

	const { state, title, message } = payload as Partial<LoadingStatusPayload>
	return (
		isLoadingState(state) &&
		typeof title === 'string' &&
		title.trim().length > 0 &&
		title.length <= 120 &&
		(typeof message === 'undefined' || (typeof message === 'string' && message.length <= 240))
	)
}

export function isValidVoiceCaptureStatePayload(payload: unknown): payload is VoiceCaptureStatePayload {
	if (!payload || typeof payload !== 'object') return false

	const { state } = payload as Partial<VoiceCaptureStatePayload>
	return state === 'idle' || state === 'recording' || state === 'processing' || state === 'error'
}

export function isValidVoiceAudioPayload(payload: unknown): payload is VoiceAudioPayload {
	if (!payload || typeof payload !== 'object') return false

	const { data, mimeType, durationMs } = payload as Partial<VoiceAudioPayload>
	const allowedMimeTypes = new Set([
		'audio/aac',
		'audio/flac',
		'audio/m4a',
		'audio/mp3',
		'audio/mp4',
		'audio/mpeg',
		'audio/ogg',
		'audio/wav',
		'audio/webm',
		'audio/webm;codecs=opus',
	])

	return (
		typeof data === 'string' &&
		data.length > 0 &&
		data.length <= 35_000_000 &&
		/^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
		typeof mimeType === 'string' &&
		allowedMimeTypes.has(mimeType.toLowerCase()) &&
		typeof durationMs === 'number' &&
		Number.isFinite(durationMs) &&
		durationMs > 0 &&
		durationMs <= 120_000
	)
}

function isLoadingState(value: unknown): value is LoadingState {
	return value === 'waiting' || value === 'recording' || value === 'transcribing' || value === 'analyzing'
}

function isFinitePositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
}
