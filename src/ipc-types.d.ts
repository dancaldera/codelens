// Shared IPC payload types, ambient so the no-bundler renderer can use them
// without emitting CommonJS module markers. Runtime values live in ipc.ts.

type LoadingState = 'waiting' | 'recording' | 'transcribing' | 'analyzing'

interface LoadingStatusPayload {
	state: LoadingState
	title: string
	message?: string
}

type VoiceCaptureState = 'idle' | 'recording' | 'processing' | 'error'

interface VoiceCaptureStatePayload {
	state: VoiceCaptureState
}

interface ResizeWindowPayload {
	width: number
	height: number
}

interface ScreenshotImagePayload {
	index: number
	url: string
}

interface VoiceAudioPayload {
	data: string
	mimeType: string
	durationMs: number
}

interface ModelChangedPayload {
	provider: string
	model: string
	index?: number
	count?: number
}
