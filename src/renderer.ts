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

	const BADGE_FLASH_MS = 450
	const BADGE_VISIBLE_MS = 2500

	interface BadgeState {
		providerLabel: string
		modelLabel: string
		vendor: string
		dataset: string
		title: string
		position: string
	}

	// ponytail: two badges (analysis model + STT model) used to duplicate
	// render/flash/timer/apply logic. One factory, configured with defaults and
	// an object-branch labeler, serves both.
	function createModelBadge(
		div: HTMLDivElement,
		defaults: BadgeState,
		labelObjectState: (info: ModelInfo) => BadgeState,
	): {
		render: () => void
		flash: (autoHide?: boolean) => void
		setLabels: (next: Partial<BadgeState>) => void
		apply: (info: string | ModelInfo | null) => void
	} {
		let pulseTimeout: ReturnType<typeof setTimeout> | null = null
		let hideTimeout: ReturnType<typeof setTimeout> | null = null
		let state: BadgeState = { ...defaults }

		function clearTimers(): void {
			if (pulseTimeout) {
				clearTimeout(pulseTimeout)
				pulseTimeout = null
			}
			if (hideTimeout) {
				clearTimeout(hideTimeout)
				hideTimeout = null
			}
		}

		function render(): void {
			const label = state.modelLabel || defaults.modelLabel
			const providerLabel = state.providerLabel || defaults.providerLabel

			div.replaceChildren()
			div.title = state.title || label

			const providerLine = document.createElement('div')
			providerLine.className = 'badge-provider'

			const providerName = document.createElement('span')
			providerName.className = 'badge-provider-name'
			providerName.textContent = state.vendor ? `${providerLabel} • ${state.vendor}` : providerLabel
			providerLine.append(providerName)

			if (state.position) {
				const modelCount = document.createElement('span')
				modelCount.className = 'badge-count'
				modelCount.textContent = state.position
				providerLine.append(modelCount)
			}

			const modelLine = document.createElement('div')
			modelLine.className = 'badge-model'
			modelLine.textContent = label

			div.append(providerLine, modelLine)

			if (state.dataset) {
				div.dataset.model = state.dataset
			} else {
				delete div.dataset.model
			}
		}

		function flash(autoHide = true): void {
			clearTimers()
			div.classList.remove('is-updating')
			void div.offsetWidth
			div.classList.add('show', 'is-updating')
			pulseTimeout = setTimeout(() => {
				div.classList.remove('is-updating')
				pulseTimeout = null
			}, BADGE_FLASH_MS)
			if (autoHide) {
				hideTimeout = setTimeout(() => {
					div.classList.remove('show')
					hideTimeout = null
				}, BADGE_VISIBLE_MS)
			}
		}

		function setLabels(next: Partial<BadgeState>): void {
			state = { ...defaults, ...next }
		}

		function apply(info: string | ModelInfo | null): void {
			if (!info) return

			clearTimers()

			if (info === 'no-key') {
				state = {
					...defaults,
					modelLabel: 'No API Key',
					vendor: '',
					dataset: 'no-key',
					title: 'OpenRouter API key missing',
					position: '',
				}
			} else if (typeof info === 'object') {
				state = labelObjectState(info)
			} else {
				const { vendor, name } = splitModelId(info)
				state = {
					...defaults,
					modelLabel: name,
					vendor,
					dataset: info.toLowerCase(),
					title: info,
					position: '',
				}
			}

			render()
			flash()
		}

		return { render, flash, setLabels, apply }
	}

	const modelBadge = createModelBadge(
		modelInfoDiv,
		{
			providerLabel: 'OpenRouter',
			modelLabel: 'Model',
			vendor: '',
			dataset: '',
			title: 'OpenRouter',
			position: '',
		},
		(info) => {
			const { vendor, name } = splitModelId(info.model)
			const providerLabel = formatProviderLabel(info.provider)
			return {
				providerLabel,
				modelLabel: name,
				vendor,
				dataset: info.model.toLowerCase(),
				title: `${providerLabel}: ${info.model}`,
				position: formatModelPosition(info),
			}
		},
	)

	const sttBadge = createModelBadge(
		sttModelInfoDiv,
		{
			providerLabel: 'Voice',
			modelLabel: 'STT',
			vendor: '',
			dataset: '',
			title: 'OpenRouter STT',
			position: '',
		},
		(info) => {
			const { vendor, name } = splitModelId(info.model)
			const providerLabel = formatProviderLabel(info.provider)
			return {
				providerLabel: 'Voice',
				modelLabel: name,
				vendor: vendor || providerLabel,
				dataset: info.model.toLowerCase(),
				title: `${providerLabel} STT: ${info.model}`,
				position: formatModelPosition(info),
			}
		},
	)

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
			normalized.includes('no model') ||
			normalized.includes('no speech') ||
			normalized.includes('api key')
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

		if (loadingDiv.parentElement !== resultDiv) {
			resultDiv.prepend(loadingDiv)
		}

		const hasRenderedContent = Array.from(resultDiv.children).some((child) => child !== loadingDiv)

		loadingDiv.replaceChildren()
		loadingDiv.dataset.state = normalizedStatus.state
		loadingDiv.classList.toggle('with-content', hasRenderedContent)
		resultDiv.dataset.loadingState = normalizedStatus.state

		const pulse = document.createElement('span')
		pulse.className = 'loading-pulse'
		pulse.setAttribute('aria-hidden', 'true')

		const copy = document.createElement('div')
		copy.className = 'loading-copy'

		const title = document.createElement('strong')
		title.className = 'loading-title'
		title.textContent = normalizedStatus.title

		const message = document.createElement('span')
		message.className = 'loading-message'
		message.textContent = normalizedStatus.message ?? 'Preparing the next step.'

		copy.append(title, message)
		loadingDiv.append(pulse, copy)
		loadingDiv.classList.remove('hidden')
		resultDiv.classList.add('visible', 'is-loading')
		scheduleRenderedContentLayoutUpdate()
	}

	function hideLoadingStatus(): void {
		loadingDiv.classList.add('hidden')
		resultDiv.classList.remove('is-loading')
		delete resultDiv.dataset.loadingState
		delete loadingDiv.dataset.state

		if (loadingDiv.parentElement === resultDiv && resultDiv.children.length === 1) {
			resultDiv.classList.remove('visible')
		}
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
			meta.textContent = `${formatDuration(Date.now() - recordingStartedAt)} · press again to stop`
		} else if (currentRecordingStatusKind === 'processing') {
			meta.textContent = 'Processing…'
		} else if (currentRecordingStatusKind === 'error') {
			meta.textContent = 'Check mic or model'
		} else {
			meta.textContent = 'Context updated'
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
			hideLoadingStatus()
			applyVoiceStatus('Recording')
		} catch (error) {
			console.error('Voice recording failed:', error)
			window.api.setVoiceCaptureState({ state: 'error' })
			applyVoiceStatus('Mic unavailable')
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
		applyVoiceStatus('Preparing…')
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
				hideLoadingStatus()
				applyVoiceStatus('No audio')
				return
			}

			const data = await blobToBase64(blob)
			window.api.sendVoiceAudio({ data, mimeType, durationMs })
			applyVoiceStatus('Transcribing')
		} catch (error) {
			console.error('Voice audio processing failed:', error)
			window.api.setVoiceCaptureState({ state: 'error' })
			hideLoadingStatus()
			applyVoiceStatus('Recording failed')
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
	modelBadge.render()
	sttBadge.render()
	modelBadge.flash()
	sttBadge.flash()

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
		hideLoadingStatus()
		renderSanitizedMarkdown(markdown)
		resultDiv.classList.add('visible')

		// Highlight code blocks
		resultDiv.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block as HTMLElement)
		})

		scheduleRenderedContentLayoutUpdate(true)
	})

	// Handle model changes
	window.api.onModelChanged(modelBadge.apply)
	window.api.onSttModelChanged(sttBadge.apply)

	// Handle models loading state
	window.api.onModelsLoading(() => {
		modelBadge.setLabels({
			providerLabel: 'OpenRouter',
			modelLabel: 'Loading models…',
			vendor: '',
			dataset: '',
			title: 'Loading OpenRouter models',
			position: '',
		})
		modelBadge.render()
		modelBadge.flash(false)
	})

	window.api.onSttModelsLoading(() => {
		sttBadge.setLabels({
			providerLabel: 'Voice',
			modelLabel: 'Loading STT…',
			vendor: '',
			dataset: '',
			title: 'Loading OpenRouter transcription models',
			position: '',
		})
		sttBadge.render()
		sttBadge.flash(false)
	})

	void window.api.getCurrentModel().then(modelBadge.apply).catch(console.error)
	void window.api.getCurrentSttModel().then(sttBadge.apply).catch(console.error)

	// Handle voice recording
	window.api.onToggleVoiceRecording(toggleVoiceRecording)
	window.api.onVoiceStatus(applyVoiceStatus)
	window.api.onVoiceTranscriptReady(() => applyVoiceStatus('Ready'))

	// Handle loadingDiv state
	window.api.onShowLoading(renderLoadingStatus)
	window.api.onHideLoading(hideLoadingStatus)

	// Handle context reset
	window.api.onContextReset(() => {
		hideLoadingStatus()
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
})
