// Single source of truth for the IPC contract: channels, payload types, and
// their runtime validators. Types are derived from the same const lists the
// validators check, so the two cannot drift apart.

export const IPC_CHANNELS = {
	ANALYSIS_RESULT: 'analysis-result',
	ANALYSIS_CHUNK: 'analysis-chunk',
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
	GET_SETTINGS_CONFIG: 'get-settings-config',
	SAVE_SETTINGS_CONFIG: 'save-settings-config',
	CLOSE_WINDOW: 'close-window',
} as const

export const MAX_SCREENSHOTS = 2
export const OVERLAY_MIN_WIDTH = 600
export const OVERLAY_MIN_HEIGHT = 400
export const OVERLAY_MAX_SIZE = 4000

export const LOADING_STATES = ['waiting', 'recording', 'transcribing', 'analyzing'] as const
export type LoadingState = (typeof LOADING_STATES)[number]

export interface LoadingStatusPayload {
	state: LoadingState
	title: string
	message?: string
}

export const VOICE_CAPTURE_STATES = ['idle', 'recording', 'processing', 'error'] as const
export type VoiceCaptureState = (typeof VOICE_CAPTURE_STATES)[number]

export interface VoiceCaptureStatePayload {
	state: VoiceCaptureState
}

export interface ResizeWindowPayload {
	width: number
	height: number
}

export interface ScreenshotImagePayload {
	index: number
	url: string
}

export const VOICE_AUDIO_MIME_TYPES = [
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
] as const

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
	/** Set when the model list comes from the fallback catalog after a fetch error. */
	error?: string
}

export interface ProviderInfo {
	id: string
	label: string
	envKey: string
	vision: boolean
	transcription: boolean
	configured: boolean
}

export interface SettingsConfig {
	provider: string
	secureStorage: boolean
	providers: ProviderInfo[]
	keys: Record<string, string>
}

export interface SaveSettingsPayload {
	provider: string
	keys: { envKey: string; value: string }[]
}

const isRecord = (payload: unknown): payload is Record<string, unknown> => !!payload && typeof payload === 'object'

const isFinitePositiveNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
	typeof value === 'string' && (values as readonly string[]).includes(value)

export function isValidResizeWindowPayload(payload: unknown): payload is ResizeWindowPayload {
	if (!isRecord(payload)) return false
	const { width, height } = payload
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
	if (!isRecord(payload)) return false
	const { state, title, message } = payload
	return (
		isOneOf(LOADING_STATES, state) &&
		typeof title === 'string' &&
		title.trim().length > 0 &&
		title.length <= 120 &&
		(typeof message === 'undefined' || (typeof message === 'string' && message.length <= 240))
	)
}

export function isValidVoiceCaptureStatePayload(payload: unknown): payload is VoiceCaptureStatePayload {
	return isRecord(payload) && isOneOf(VOICE_CAPTURE_STATES, payload.state)
}

export function isValidVoiceAudioPayload(payload: unknown): payload is VoiceAudioPayload {
	if (!isRecord(payload)) return false
	const { data, mimeType, durationMs } = payload
	return (
		typeof data === 'string' &&
		data.length > 0 &&
		data.length <= 35_000_000 &&
		/^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
		typeof mimeType === 'string' &&
		isOneOf(VOICE_AUDIO_MIME_TYPES, mimeType.toLowerCase()) &&
		isFinitePositiveNumber(durationMs) &&
		durationMs <= 120_000
	)
}

export function isValidSaveSettingsPayload(
	payload: unknown,
	allowedProviders: string[],
	allowedKeys: string[],
): payload is SaveSettingsPayload {
	if (!isRecord(payload)) return false
	const { provider, keys } = payload
	return (
		typeof provider === 'string' &&
		allowedProviders.includes(provider) &&
		Array.isArray(keys) &&
		keys.length <= 16 &&
		keys.every(
			(key) =>
				isRecord(key) &&
				typeof key.envKey === 'string' &&
				allowedKeys.includes(key.envKey) &&
				typeof key.value === 'string' &&
				key.value.length <= 512,
		)
	)
}
