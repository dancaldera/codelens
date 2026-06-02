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
	let currentModelLabel = ''
	let currentModelDataset = ''

	function updateModelInfoBadge(): void {
		const label = currentModelLabel || 'Model'

		modelInfoDiv.replaceChildren()

		const modelLine = document.createElement('div')
		modelLine.className = 'badge-model'
		modelLine.textContent = label

		modelInfoDiv.append(modelLine)

		if (currentModelDataset) {
			modelInfoDiv.dataset.model = currentModelDataset
		} else {
			delete modelInfoDiv.dataset.model
		}
	}

	const BADGE_VISIBLE_MS = 3000

	function flashModelInfoBadge(): void {
		modelInfoDiv.classList.add('show')
		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
		}
		modelInfoTimeout = setTimeout(() => {
			modelInfoDiv.classList.remove('show')
			modelInfoTimeout = null
		}, BADGE_VISIBLE_MS)
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
	window.api.onModelChanged((info: string | ModelInfo) => {
		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
		}

		// Update model info
		if (info === 'no-key') {
			currentModelLabel = 'No API Key'
			currentModelDataset = 'no-key'
		} else if (typeof info === 'object') {
			currentModelLabel = info.model
			currentModelDataset = info.model
		} else {
			currentModelLabel = info
			currentModelDataset = info
		}

		updateModelInfoBadge()
		flashModelInfoBadge()
	})

	// Handle models loading state
	window.api.onModelsLoading(() => {
		currentModelLabel = 'Loading models...'
		currentModelDataset = ''
		updateModelInfoBadge()
		modelInfoDiv.classList.add('show')
	})

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
