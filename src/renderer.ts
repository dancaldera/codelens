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

window.addEventListener('DOMContentLoaded', () => {
	const screenshots = document.getElementById('screenshots')
	const result = document.getElementById('result')
	const loading = document.getElementById('loading')
	const modelInfo = document.getElementById('modelInfo')
	const sttModelInfo = document.getElementById('sttModelInfo')

	// Ensure all required DOM elements exist
	if (!screenshots || !result || !loading || !modelInfo || !sttModelInfo) {
		console.error('Required DOM elements not found')
		return
	}

	const screenshotsDiv = screenshots as HTMLDivElement
	const resultDiv = result as HTMLDivElement
	const loadingDiv = loading as HTMLDivElement
	const modelInfoDiv = modelInfo as HTMLDivElement
	const sttModelInfoDiv = sttModelInfo as HTMLDivElement

	const MAX_SCREENSHOTS = 2
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

	function applyVoiceStatus(status: string): void {
		currentSttProviderLabel = 'Voice'
		currentSttModelLabel = status
		currentSttModelVendor = ''
		currentSttModelPosition = ''
		currentSttModelTitle = status
		currentSttModelDataset = status.toLowerCase().includes('recording')
			? 'recording'
			: status.toLowerCase().includes('ready')
				? 'ready'
				: currentSttModelDataset
		updateSttModelInfoBadge()
		flashSttModelInfoBadge(!status.toLowerCase().includes('recording'))
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
			applyVoiceStatus('Recording…')
		} catch (error) {
			console.error('Voice recording failed:', error)
			applyVoiceStatus('Microphone unavailable')
			stopVoiceStream()
		}
	}

	function stopVoiceRecording(): void {
		if (!mediaRecorder || mediaRecorder.state === 'inactive') return
		mediaRecorder.stop()
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
				applyVoiceStatus('No audio recorded')
				return
			}

			const data = await blobToBase64(blob)
			window.api.sendVoiceAudio({ data, mimeType, durationMs })
			applyVoiceStatus('Transcribing…')
		} catch (error) {
			console.error('Voice audio processing failed:', error)
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

		// Content will naturally overflow the window - no auto-resize
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
	window.api.onShowLoading(() => {
		loadingDiv.classList.remove('hidden')
	})

	// Handle context reset
	window.api.onContextReset(() => {
		resultDiv.replaceChildren()
		resultDiv.classList.remove('visible')
		screenshotData.clear()
		screenshotsDiv.querySelectorAll('.screenshot').forEach((slot, i) => {
			const element = slot as HTMLDivElement
			element.style.backgroundImage = ''
			element.textContent = (i + 1).toString()
			element.classList.remove('active')
		})
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
	})

	// Unused handlers (for compatibility)
	window.api.onScreenshotStatus(() => {})
	window.api.onLanguageDetected(() => {})
	window.api.onGetPrompt(() => 'Analyze this code')
})
