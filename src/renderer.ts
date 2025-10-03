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
	const screenshots = document.getElementById('screenshots') as HTMLDivElement
	const result = document.getElementById('result') as HTMLDivElement
	const loading = document.getElementById('loading') as HTMLDivElement
	const modelInfo = document.getElementById('modelInfo') as HTMLDivElement

	const MAX_SCREENSHOTS = 2
	const screenshotData = new Map<number, ScreenshotData>()

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
			screenshots.appendChild(slot)
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

	// Handle analysis results
	window.api.onAnalysisResult((markdown: string) => {
		loading.classList.add('hidden')
		result.innerHTML = marked.parse(markdown)
		result.classList.add('visible')

		// Highlight code blocks
		result.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block as HTMLElement)
		})
		
		// Content will naturally overflow the window - no auto-resize
	})

	// Handle model changes
	window.api.onModelChanged((info: string | ModelInfo) => {
		if (info === 'no-key') {
			modelInfo.textContent = 'No API Key'
			modelInfo.dataset.model = 'no-key'
		} else if (typeof info === 'object') {
			modelInfo.textContent = info.model
			modelInfo.dataset.model = info.model
		} else {
			modelInfo.textContent = info
			modelInfo.dataset.model = info
		}
	})

	// Handle loading state
	window.api.onShowLoading(() => {
		loading.classList.remove('hidden')
	})

	// Handle context reset
	window.api.onContextReset(() => {
		result.innerHTML = ''
		result.classList.remove('visible')
		screenshotData.clear()
		screenshots.querySelectorAll('.screenshot').forEach((slot, i) => {
			const element = slot as HTMLDivElement
			element.style.backgroundImage = ''
			element.textContent = (i + 1).toString()
			element.classList.remove('active')
		})
	})

	// Handle screenshot clear
	window.api.onClearScreenshots(() => {
		screenshotData.clear()
		screenshots.querySelectorAll('.screenshot').forEach((slot, i) => {
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
