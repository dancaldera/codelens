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
	let currentAnalysisMode: 'code' | 'general' = 'code'

	function updateModelInfoBadge(): void {
		const label = currentModelLabel || 'Model'
		const modeSuffix = currentAnalysisMode === 'general' ? ' • General' : ''
		modelInfoDiv.textContent = `${label}${modeSuffix}`

		if (currentModelDataset) {
			modelInfoDiv.dataset.model = currentModelDataset
		} else {
			delete modelInfoDiv.dataset.model
		}

		modelInfoDiv.dataset.mode = currentAnalysisMode
	}

	function flashModelInfoBadge(): void {
		modelInfoDiv.classList.add('show')
		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
		}
		modelInfoTimeout = setTimeout(() => {
			modelInfoDiv.classList.remove('show')
			modelInfoTimeout = null
		}, 3000)
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
		resultDiv.innerHTML = marked.parse(markdown)
		resultDiv.classList.add('visible')

		// Apply current mode class
		if (currentAnalysisMode === 'general') {
			resultDiv.classList.add('general-mode')
			resultDiv.classList.remove('code-mode')
		} else {
			resultDiv.classList.add('code-mode')
			resultDiv.classList.remove('general-mode')
		}

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

	window.api.onAnalysisModeChanged((mode: string) => {
		if (modelInfoTimeout) {
			clearTimeout(modelInfoTimeout)
		}

		currentAnalysisMode = mode === 'general' ? 'general' : 'code'

		// Apply mode-specific class to resultDiv panel
		if (currentAnalysisMode === 'general') {
			resultDiv.classList.add('general-mode')
			resultDiv.classList.remove('code-mode')
		} else {
			resultDiv.classList.add('code-mode')
			resultDiv.classList.remove('general-mode')
		}

		updateModelInfoBadge()
		flashModelInfoBadge()
	})

	// Handle loadingDiv state
	window.api.onShowLoading(() => {
		loadingDiv.classList.remove('hidden')
	})

	// Handle context reset
	window.api.onContextReset(() => {
		resultDiv.innerHTML = ''
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
