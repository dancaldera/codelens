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

	// Ensure all required DOM elements exist
	if (!screenshots || !result || !loading || !modelInfo) {
		console.error('Required DOM elements not found')
		return
	}

	const screenshotsDiv = screenshots as HTMLDivElement
	const resultDiv = result as HTMLDivElement
	const loadingDiv = loading as HTMLDivElement
	const modelInfoDiv = modelInfo as HTMLDivElement

	const MAX_SCREENSHOTS = 2
	const screenshotData = new Map<number, ScreenshotData>()
	let modelInfoTimeout: ReturnType<typeof setTimeout> | null = null
	let currentProviderLabel = 'OpenRouter'
	let currentModelLabel = 'Model'
	let currentModelVendor = ''
	let currentModelDataset = ''
	let currentModelTitle = 'OpenRouter'
	let currentModelPosition = ''

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

	function flashModelInfoBadge(): void {
		modelInfoDiv.classList.remove('is-updating')
		void modelInfoDiv.offsetWidth
		modelInfoDiv.classList.add('show', 'is-updating')
		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
		}
		modelInfoTimeout = setTimeout(() => {
			modelInfoDiv.classList.remove('is-updating')
			modelInfoTimeout = null
		}, BADGE_FLASH_MS)
	}

	function applyModelInfo(info: string | ModelInfo | null): void {
		if (!info) return

		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
			modelInfoTimeout = null
		}

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

	function renderSanitizedMarkdown(markdown: string): void {
		const unsafeHtml = marked.parse(markdown)
		const safeHtml = DOMPurify.sanitize(unsafeHtml, {
			USE_PROFILES: { html: true },
			ADD_ATTR: ['class'],
		})
		const parsedDocument = new DOMParser().parseFromString(safeHtml, 'text/html')
		resultDiv.replaceChildren(...Array.from(parsedDocument.body.childNodes))
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
	flashModelInfoBadge()

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

	// Handle models loading state
	window.api.onModelsLoading(() => {
		currentProviderLabel = 'OpenRouter'
		currentModelLabel = 'Loading models…'
		currentModelVendor = ''
		currentModelDataset = ''
		currentModelTitle = 'Loading OpenRouter models'
		currentModelPosition = ''
		updateModelInfoBadge()
		modelInfoDiv.classList.add('show')
	})

	void window.api.getCurrentModel().then(applyModelInfo).catch(console.error)

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
