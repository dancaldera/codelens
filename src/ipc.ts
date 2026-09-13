export const IPC_CHANNELS = {
	ANALYSIS_RESULT: 'analysis-result',
	CONTEXT_RESET: 'context-reset',
	SCREENSHOT_IMAGE: 'screenshot-image',
	CLEAR_SCREENSHOTS: 'clear-screenshots',
	SHOW_LOADING: 'show-loading',
	HIDE_LOADING: 'hide-loading',
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
} as const

export const MAX_SCREENSHOTS = 2
export const OVERLAY_MIN_WIDTH = 600
export const OVERLAY_MIN_HEIGHT = 400
export const OVERLAY_MAX_SIZE = 4000

export function isValidResizeWindowPayload(payload: unknown): payload is ResizeWindowPayload {
	if (!payload || typeof payload !== 'object') return false

	const { width, height } = payload as Partial<ResizeWindowPayload>
	return (
		isFinitePositiveNumber(width) &&
		isFinitePositiveNumber(height) &&
		width >= OVERLAY_MIN_WIDTH &&
		height >= OVERLAY_MIN_HEIGHT &&
		width <= OVERLAY_MAX_SIZE &&
		height <= OVERLAY_MAX_SIZE
	)
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
