// CodeLens Renderer - TypeScript

// Type declarations for external libraries
declare const marked: {
	parse: (markdown: string) => string
	setOptions: (options: { highlight?: (code: string, lang: string) => string; breaks?: boolean }) => void
}

declare const hljs: {
	highlight: (code: string, options: { language: string }) => { value: string }
	highlightAuto: (code: string) => { value: string }
	highlightElement: (element: HTMLElement) => void
	getLanguage: (name: string) => unknown
}

declare const DOMPurify: {
	sanitize: (html: string, config?: Record<string, unknown>) => string
}

interface ScreenshotData {
	index: number
	path: string
	data: string
}

interface ModelInfo {
	provider: string
	model: string
	index?: number
	count?: number
}

type RecordingStatusKind = 'recording' | 'processing' | 'ready' | 'error'

type LoadingState = 'waiting' | 'recording' | 'transcribing' | 'analyzing'

interface LoadingStatusPayload {
	state: LoadingState
	title: string
	message?: string
}

window.addEventListener('DOMContentLoaded', () => {
	const screenshots = document.getElementById('screenshots')
	const result = document.getElementById('result')
	const loading = document.getElementById('loading')
	const modelInfo = document.getElementById('modelInfo')
	const sttModelInfo = document.getElementById('sttModelInfo')
	const recordingStatus = document.getElementById('recordingStatus')

	// Ensure all required DOM elements exist
	if (!screenshots || !result || !loading || !modelInfo || !sttModelInfo || !recordingStatus) {
		console.error('Required DOM elements not found')
		return
	}

	const screenshotsDiv = screenshots as HTMLDivElement
	const resultDiv = result as HTMLDivElement
	const loadingDiv = loading as HTMLDivElement
	const modelInfoDiv = modelInfo as HTMLDivElement
	const sttModelInfoDiv = sttModelInfo as HTMLDivElement
	const recordingStatusDiv = recordingStatus as HTMLDivElement

	const MAX_SCREENSHOTS = 2
	const MIN_OVERLAY_WIDTH = 600
	const MIN_OVERLAY_HEIGHT = 400
	const MAX_OVERLAY_SIZE = 4000
	const screenshotData = new Map<number, ScreenshotData>()
	let modelInfoPulseTimeout: ReturnType<typeof setTimeout> | null = null
	let modelInfoHideTimeout: ReturnType<typeof setTimeout> | null = null
	let currentProviderLabel = 'OpenRouter'
	let currentModelLabel = 'Model'
	let currentModelVendor = ''
	let currentModelDataset = ''
	let currentModelTitle = 'OpenRouter'
	let currentModelPosition = ''
	let sttModelInfoPulseTimeout: ReturnType<typeof setTimeout> | null = null
	let sttModelInfoHideTimeout: ReturnType<typeof setTimeout> | null = null
	let currentSttProviderLabel = 'Voice'
	let currentSttModelLabel = 'STT'
	let currentSttModelVendor = ''
	let currentSttModelDataset = ''
	let currentSttModelTitle = 'OpenRouter STT'
	let currentSttModelPosition = ''
	let mediaRecorder: MediaRecorder | null = null
	let mediaStream: MediaStream | null = null
	let voiceChunks: Blob[] = []
	let recordingStartedAt = 0
	let recordingStatusHideTimeout: ReturnType<typeof setTimeout> | null = null
	let recordingStatusTimer: ReturnType<typeof setInterval> | null = null
	let currentRecordingStatus = ''
	let currentRecordingStatusKind: RecordingStatusKind = 'ready'

	function formatProviderLabel(provider: string): string {
		if (provider.toLowerCase() === 'openrouter') return 'OpenRouter'

		return provider
			.split(/[-_\s]+/)
			.filter(Boolean)
			.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
			.join(' ')
	}

	function splitModelId(model: string): { vendor: string; name: string } {
		const [vendor, ...nameParts] = model.split('/')
		if (!vendor || !nameParts.length) return { vendor: '', name: model }

		return { vendor, name: nameParts.join('/') }
	}

	function formatModelPosition(info: ModelInfo): string {
		if (typeof info.index !== 'number' || typeof info.count !== 'number' || info.count <= 0) return ''

		return `${info.index + 1}/${info.count}`
	}

	function updateModelInfoBadge(): void {
		const label = currentModelLabel || 'Model'
		const providerLabel = currentProviderLabel || 'OpenRouter'

		modelInfoDiv.replaceChildren()
		modelInfoDiv.title = currentModelTitle || label

		const providerLine = document.createElement('div')
		providerLine.className = 'badge-provider'

		const providerName = document.createElement('span')
		providerName.className = 'badge-provider-name'
		providerName.textContent = currentModelVendor ? `${providerLabel} • ${currentModelVendor}` : providerLabel
		providerLine.append(providerName)

		if (currentModelPosition) {
			const modelCount = document.createElement('span')
			modelCount.className = 'badge-count'
			modelCount.textContent = currentModelPosition
			providerLine.append(modelCount)
		}

		const modelLine = document.createElement('div')
		modelLine.className = 'badge-model'
		modelLine.textContent = label

		modelInfoDiv.append(providerLine, modelLine)

		if (currentModelDataset) {
			modelInfoDiv.dataset.model = currentModelDataset
		} else {
			delete modelInfoDiv.dataset.model
		}
	}

	const BADGE_FLASH_MS = 450
	const BADGE_VISIBLE_MS = 2500

	function clearModelInfoTimers(): void {
		if (modelInfoPulseTimeout) {
			clearTimeout(modelInfoPulseTimeout)
			modelInfoPulseTimeout = null
		}
		if (modelInfoHideTimeout) {
			clearTimeout(modelInfoHideTimeout)
			modelInfoHideTimeout = null
		}
	}

	function flashModelInfoBadge(autoHide = true): void {
		clearModelInfoTimers()
		modelInfoDiv.classList.remove('is-updating')
		void modelInfoDiv.offsetWidth
		modelInfoDiv.classList.add('show', 'is-updating')
		modelInfoPulseTimeout = setTimeout(() => {
			modelInfoDiv.classList.remove('is-updating')
			modelInfoPulseTimeout = null
		}, BADGE_FLASH_MS)
		if (autoHide) {
			modelInfoHideTimeout = setTimeout(() => {
				modelInfoDiv.classList.remove('show')
				modelInfoHideTimeout = null
			}, BADGE_VISIBLE_MS)
		}
	}

	function applyModelInfo(info: string | ModelInfo | null): void {
		if (!info) return

		clearModelInfoTimers()

		if (info === 'no-key') {
			currentProviderLabel = 'OpenRouter'
			currentModelLabel = 'No API Key'
			currentModelVendor = ''
			currentModelDataset = 'no-key'
			currentModelTitle = 'OpenRouter API key missing'
			currentModelPosition = ''
		} else if (typeof info === 'object') {
			const { vendor, name } = splitModelId(info.model)
			currentProviderLabel = formatProviderLabel(info.provider)
			currentModelLabel = name
			currentModelVendor = vendor
			currentModelDataset = info.model.toLowerCase()
			currentModelTitle = `${currentProviderLabel}: ${info.model}`
			currentModelPosition = formatModelPosition(info)
		} else {
			const { vendor, name } = splitModelId(info)
			currentProviderLabel = 'OpenRouter'
			currentModelLabel = name
			currentModelVendor = vendor
			currentModelDataset = info.toLowerCase()
			currentModelTitle = info
			currentModelPosition = ''
		}

		updateModelInfoBadge()
		flashModelInfoBadge()
	}

	function updateSttModelInfoBadge(): void {
		const label = currentSttModelLabel || 'STT'
		const providerLabel = currentSttProviderLabel || 'Voice'

		sttModelInfoDiv.replaceChildren()
		sttModelInfoDiv.title = currentSttModelTitle || label

		const providerLine = document.createElement('div')
		providerLine.className = 'badge-provider'

		const providerName = document.createElement('span')
		providerName.className = 'badge-provider-name'
		providerName.textContent = currentSttModelVendor ? `${providerLabel} • ${currentSttModelVendor}` : providerLabel
		providerLine.append(providerName)

		if (currentSttModelPosition) {
			const modelCount = document.createElement('span')
			modelCount.className = 'badge-count'
			modelCount.textContent = currentSttModelPosition
			providerLine.append(modelCount)
		}

		const modelLine = document.createElement('div')
		modelLine.className = 'badge-model'
		modelLine.textContent = label

		sttModelInfoDiv.append(providerLine, modelLine)

		if (currentSttModelDataset) {
			sttModelInfoDiv.dataset.model = currentSttModelDataset
		} else {
			delete sttModelInfoDiv.dataset.model
		}
	}

	function clearSttModelInfoTimers(): void {
		if (sttModelInfoPulseTimeout) {
			clearTimeout(sttModelInfoPulseTimeout)
			sttModelInfoPulseTimeout = null
		}
		if (sttModelInfoHideTimeout) {
			clearTimeout(sttModelInfoHideTimeout)
			sttModelInfoHideTimeout = null
		}
	}

	function flashSttModelInfoBadge(autoHide = true): void {
		clearSttModelInfoTimers()
		sttModelInfoDiv.classList.remove('is-updating')
		void sttModelInfoDiv.offsetWidth
		sttModelInfoDiv.classList.add('show', 'is-updating')
		sttModelInfoPulseTimeout = setTimeout(() => {
			sttModelInfoDiv.classList.remove('is-updating')
			sttModelInfoPulseTimeout = null
		}, BADGE_FLASH_MS)
		if (autoHide) {
			sttModelInfoHideTimeout = setTimeout(() => {
				sttModelInfoDiv.classList.remove('show')
				sttModelInfoHideTimeout = null
			}, BADGE_VISIBLE_MS)
		}
	}

	function applySttModelInfo(info: string | ModelInfo | null): void {
		if (!info) return

		clearSttModelInfoTimers()

		if (info === 'no-key') {
			currentSttProviderLabel = 'Voice'
			currentSttModelLabel = 'No API Key'
			currentSttModelVendor = ''
			currentSttModelDataset = 'no-key'
			currentSttModelTitle = 'OpenRouter API key missing'
			currentSttModelPosition = ''
		} else if (typeof info === 'object') {
			const { vendor, name } = splitModelId(info.model)
			currentSttProviderLabel = 'Voice'
			currentSttModelLabel = name
			currentSttModelVendor = vendor || formatProviderLabel(info.provider)
			currentSttModelDataset = info.model.toLowerCase()
			currentSttModelTitle = `${formatProviderLabel(info.provider)} STT: ${info.model}`
			currentSttModelPosition = formatModelPosition(info)
		} else {
			const { vendor, name } = splitModelId(info)
			currentSttProviderLabel = 'Voice'
			currentSttModelLabel = name
			currentSttModelVendor = vendor
			currentSttModelDataset = info.toLowerCase()
			currentSttModelTitle = info
			currentSttModelPosition = ''
		}

		updateSttModelInfoBadge()
		flashSttModelInfoBadge()
	}

	function formatDuration(ms: number): string {
		const totalSeconds = Math.max(Math.floor(ms / 1000), 0)
		const minutes = Math.floor(totalSeconds / 60)
		const seconds = totalSeconds % 60
		return `${minutes}:${seconds.toString().padStart(2, '0')}`
	}

	function classifyVoiceStatus(status: string): RecordingStatusKind | 'model' {
		const normalized = status.toLowerCase()

		if (normalized.startsWith('voice model:')) return 'model'
		if (normalized.includes('recording') && !normalized.includes('failed')) return 'recording'
		if (
			normalized.includes('preparing') ||
			normalized.includes('transcribing') ||
			normalized.includes('loading') ||
			normalized.includes('still loading')
		) {
			return 'processing'
		}
		if (
			normalized.includes('unavailable') ||
			normalized.includes('failed') ||
			normalized.includes('invalid') ||
			normalized.includes('no audio') ||
			normalized.includes('no stt') ||
			normalized.includes('no model')
		) {
			return 'error'
		}

		return 'ready'
	}

	function clearRecordingStatusHideTimer(): void {
		if (!recordingStatusHideTimeout) return
		clearTimeout(recordingStatusHideTimeout)
		recordingStatusHideTimeout = null
	}

	function clearRecordingStatusTimer(): void {
		if (!recordingStatusTimer) return
		clearInterval(recordingStatusTimer)
		recordingStatusTimer = null
	}

	function renderLoadingStatus(status?: LoadingStatusPayload): void {
		const normalizedStatus = status ?? {
			state: 'analyzing' as const,
			title: 'Analyzing context',
			message: 'Reading screenshots and building the answer.',
		}

		loadingDiv.replaceChildren()
		loadingDiv.dataset.state = normalizedStatus.state

		const icon = document.createElement('div')
		icon.className = 'loading-icon'
		for (let i = 0; i < 3; i++) {
			const dot = document.createElement('span')
			dot.className = 'loading-dot'
			icon.append(dot)
		}

		const copy = document.createElement('div')
		copy.className = 'loading-copy'

		const title = document.createElement('strong')
		title.className = 'loading-title'
		title.textContent = normalizedStatus.title

		const message = document.createElement('span')
		message.className = 'loading-message'
		message.textContent = normalizedStatus.message ?? 'Preparing the next step.'

		copy.append(title, message)
		loadingDiv.append(icon, copy)
		loadingDiv.classList.remove('hidden')
	}

	function renderRecordingStatusCard(): void {
		recordingStatusDiv.replaceChildren()
		recordingStatusDiv.dataset.status = currentRecordingStatusKind

		const dot = document.createElement('span')
		dot.className = 'recording-dot'
		dot.setAttribute('aria-hidden', 'true')

		const copy = document.createElement('div')
		copy.className = 'recording-copy'

		const label = document.createElement('span')
		label.className = 'recording-label'
		label.textContent = currentRecordingStatus

		const meta = document.createElement('span')
		meta.className = 'recording-meta'
		if (currentRecordingStatusKind === 'recording') {
			meta.textContent = `${formatDuration(Date.now() - recordingStartedAt)} • Shift+Cmd/Ctrl+H to stop`
		} else if (currentRecordingStatusKind === 'processing') {
			meta.textContent = 'Processing voice context'
		} else if (currentRecordingStatusKind === 'error') {
			meta.textContent = 'Check microphone or model setup'
		} else {
			meta.textContent = 'Voice context updated'
		}

		copy.append(label, meta)
		recordingStatusDiv.append(dot, copy)
	}

	function hideRecordingStatusCard(): void {
		clearRecordingStatusHideTimer()
		clearRecordingStatusTimer()
		recordingStatusDiv.classList.remove('show')
		recordingStatusDiv.classList.add('hidden')
	}

	function showRecordingStatusCard(status: string, kind: RecordingStatusKind): void {
		clearRecordingStatusHideTimer()
		currentRecordingStatus = status
		currentRecordingStatusKind = kind

		if (kind === 'recording' && recordingStartedAt <= 0) {
			recordingStartedAt = Date.now()
		}

		renderRecordingStatusCard()
		recordingStatusDiv.classList.remove('hidden')
		void recordingStatusDiv.offsetWidth
		recordingStatusDiv.classList.add('show')

		if (kind === 'recording') {
			clearRecordingStatusTimer()
			recordingStatusTimer = setInterval(renderRecordingStatusCard, 500)
		} else {
			clearRecordingStatusTimer()
		}

		if (kind === 'ready' || kind === 'error') {
			recordingStatusHideTimeout = setTimeout(hideRecordingStatusCard, kind === 'error' ? 3600 : 2500)
		}
	}

	function applyVoiceStatus(status: string): void {
		const kind = classifyVoiceStatus(status)
		if (kind === 'model') return
		showRecordingStatusCard(status, kind)
	}

	function renderSanitizedMarkdown(markdown: string): void {
		const unsafeHtml = marked.parse(markdown)
		const safeHtml = DOMPurify.sanitize(unsafeHtml, {
			USE_PROFILES: { html: true },
			ADD_ATTR: ['class'],
		})
		const parsedDocument = new DOMParser().parseFromString(safeHtml, 'text/html')
		resultDiv.replaceChildren(...Array.from(parsedDocument.body.childNodes))
	}

	function clampOverlaySize(value: number, min: number): number {
		return Math.min(Math.max(Math.ceil(value), min), MAX_OVERLAY_SIZE)
	}

	function measureRenderedOverlayHeight(): number {
		const app = document.getElementById('app')
		return Math.max(
			window.innerHeight,
			document.documentElement.scrollHeight,
			document.body.scrollHeight,
			app?.scrollHeight ?? 0,
		)
	}

	function resizeOverlayToRenderedContent(): void {
		const width = clampOverlaySize(window.innerWidth, MIN_OVERLAY_WIDTH)
		const height = clampOverlaySize(measureRenderedOverlayHeight(), MIN_OVERLAY_HEIGHT)
		window.api.resizeWindow(width, height)
	}

	function scheduleRenderedContentLayoutUpdate(scrollToTop = false): void {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (scrollToTop) {
					const app = document.getElementById('app')
					if (app) app.scrollTop = 0
				}
				resizeOverlayToRenderedContent()
			})
		})
	}

	function getSupportedAudioMimeType(): string {
		const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
		return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? 'audio/webm'
	}

	async function startVoiceRecording(): Promise<void> {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') return

		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
			voiceChunks = []
			recordingStartedAt = Date.now()
			const mimeType = getSupportedAudioMimeType()
			mediaRecorder = new MediaRecorder(mediaStream, { mimeType })

			mediaRecorder.addEventListener('dataavailable', (event) => {
				if (event.data.size > 0) {
					voiceChunks.push(event.data)
				}
			})

			mediaRecorder.addEventListener('stop', () => {
				void sendRecordedVoiceAudio(mimeType)
			})

			mediaRecorder.start()
			window.api.setVoiceCaptureState({ state: 'recording' })
			renderLoadingStatus({
				state: 'recording',
				title: 'Recording voice context',
				message: 'Capture screenshots while speaking, or stop recording to analyze.',
			})
			applyVoiceStatus('Recording…')
		} catch (error) {
			console.error('Voice recording failed:', error)
			window.api.setVoiceCaptureState({ state: 'error' })
			applyVoiceStatus('Microphone unavailable')
			stopVoiceStream()
		}
	}

	function stopVoiceRecording(): void {
		if (!mediaRecorder || mediaRecorder.state === 'inactive') return
		window.api.setVoiceCaptureState({ state: 'processing' })
		mediaRecorder.stop()
		renderLoadingStatus({
			state: 'transcribing',
			title: 'Preparing voice context',
			message: 'Transcribing your note before starting analysis.',
		})
		applyVoiceStatus('Preparing voice note…')
	}

	function stopVoiceStream(): void {
		for (const track of mediaStream?.getTracks() ?? []) {
			track.stop()
		}
		mediaStream = null
	}

	async function sendRecordedVoiceAudio(mimeType: string): Promise<void> {
		try {
			stopVoiceStream()
			const durationMs = Math.max(Date.now() - recordingStartedAt, 1)
			const blob = new Blob(voiceChunks, { type: mimeType })
			voiceChunks = []

			if (blob.size === 0) {
				window.api.setVoiceCaptureState({ state: 'error' })
				loadingDiv.classList.add('hidden')
				applyVoiceStatus('No audio recorded')
				return
			}

			const data = await blobToBase64(blob)
			window.api.sendVoiceAudio({ data, mimeType, durationMs })
			applyVoiceStatus('Transcribing…')
		} catch (error) {
			console.error('Voice audio processing failed:', error)
			window.api.setVoiceCaptureState({ state: 'error' })
			loadingDiv.classList.add('hidden')
			applyVoiceStatus('Voice recording failed')
		} finally {
			mediaRecorder = null
		}
	}

	function blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.addEventListener('loadend', () => {
				const result = typeof reader.result === 'string' ? reader.result : ''
				const [, base64 = ''] = result.split(',')
				resolve(base64)
			})
			reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read audio blob')))
			reader.readAsDataURL(blob)
		})
	}

	function toggleVoiceRecording(): void {
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			stopVoiceRecording()
			return
		}

		void startVoiceRecording()
	}

	// Configure marked.js
	marked.setOptions({
		highlight: (code: string, lang: string): string => {
			if (lang && hljs.getLanguage(lang)) {
				return hljs.highlight(code, { language: lang }).value
			}
			return hljs.highlightAuto(code).value
		},
		breaks: true,
	})

	// Initialize screenshot slots
	function initScreenshots(): void {
		for (let i = 1; i <= MAX_SCREENSHOTS; i++) {
			const slot = document.createElement('div')
			slot.className = 'screenshot'
			slot.id = `screenshot${i}`
			slot.textContent = i.toString()
			screenshotsDiv.appendChild(slot)
		}
	}

	initScreenshots()
	updateModelInfoBadge()
	updateSttModelInfoBadge()
	flashModelInfoBadge()
	flashSttModelInfoBadge()

	// Handle screenshot images
	window.api.onScreenshotImage((data: ScreenshotData) => {
		const slot = document.getElementById(`screenshot${data.index}`) as HTMLDivElement | null
		if (!slot) return

		screenshotData.set(data.index, data)
		slot.style.backgroundImage = `url(data:image/png;base64,${data.data})`
		slot.textContent = ''
		slot.classList.add('active')
	})

	// Handle analysis resultDivs
	window.api.onAnalysisResult((markdown: string) => {
		loadingDiv.classList.add('hidden')
		renderSanitizedMarkdown(markdown)
		resultDiv.classList.add('visible')

		// Highlight code blocks
		resultDiv.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block as HTMLElement)
		})

		scheduleRenderedContentLayoutUpdate(true)
	})

	// Handle model changes
	window.api.onModelChanged(applyModelInfo)
	window.api.onSttModelChanged(applySttModelInfo)

	// Handle models loading state
	window.api.onModelsLoading(() => {
		currentProviderLabel = 'OpenRouter'
		currentModelLabel = 'Loading models…'
		currentModelVendor = ''
		currentModelDataset = ''
		currentModelTitle = 'Loading OpenRouter models'
		currentModelPosition = ''
		updateModelInfoBadge()
		flashModelInfoBadge(false)
	})

	window.api.onSttModelsLoading(() => {
		currentSttProviderLabel = 'Voice'
		currentSttModelLabel = 'Loading STT…'
		currentSttModelVendor = ''
		currentSttModelDataset = ''
		currentSttModelTitle = 'Loading OpenRouter transcription models'
		currentSttModelPosition = ''
		updateSttModelInfoBadge()
		flashSttModelInfoBadge(false)
	})

	void window.api.getCurrentModel().then(applyModelInfo).catch(console.error)
	void window.api.getCurrentSttModel().then(applySttModelInfo).catch(console.error)

	// Handle voice recording
	window.api.onToggleVoiceRecording(toggleVoiceRecording)
	window.api.onVoiceStatus(applyVoiceStatus)
	window.api.onVoiceTranscriptReady(() => applyVoiceStatus('Voice context ready'))

	// Handle loadingDiv state
	window.api.onShowLoading(renderLoadingStatus)

	// Handle context reset
	window.api.onContextReset(() => {
		loadingDiv.classList.add('hidden')
		resultDiv.replaceChildren()
		resultDiv.classList.remove('visible')
		screenshotData.clear()
		screenshotsDiv.querySelectorAll('.screenshot').forEach((slot, i) => {
			const element = slot as HTMLDivElement
			element.style.backgroundImage = ''
			element.textContent = (i + 1).toString()
			element.classList.remove('active')
		})
		scheduleRenderedContentLayoutUpdate(true)
	})

	// Handle screenshot clear
	window.api.onClearScreenshots(() => {
		screenshotData.clear()
		screenshotsDiv.querySelectorAll('.screenshot').forEach((slot, i) => {
			const element = slot as HTMLDivElement
			element.style.backgroundImage = ''
			element.textContent = (i + 1).toString()
			element.classList.remove('active')
		})
		scheduleRenderedContentLayoutUpdate()
	})

	// Unused handlers (for compatibility)
	window.api.onScreenshotStatus(() => {})
	window.api.onLanguageDetected(() => {})
	window.api.onGetPrompt(() => 'Analyze this code')
})
