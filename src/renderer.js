// CodeLens Renderer - Simplified
window.addEventListener('DOMContentLoaded', () => {
	const screenshots = document.getElementById('screenshots')
	const result = document.getElementById('result')
	const loading = document.getElementById('loading')
	const modelInfo = document.getElementById('modelInfo')
	const modeInfo = document.getElementById('modeInfo')

	const MAX_SCREENSHOTS = 2
	const screenshotData = new Map()

	// Configure marked.js
	marked.setOptions({
		highlight: (code, lang) => {
			if (lang && hljs.getLanguage(lang)) {
				return hljs.highlight(code, { language: lang }).value
			}
			return hljs.highlightAuto(code).value
		},
		breaks: true,
	})

	// Initialize screenshot slots
	function initScreenshots() {
		for (let i = 1; i <= MAX_SCREENSHOTS; i++) {
			const slot = document.createElement('div')
			slot.className = 'screenshot'
			slot.id = `screenshot${i}`
			slot.textContent = i
			screenshots.appendChild(slot)
		}
	}

	initScreenshots()

	// Handle screenshot images
	window.api.onScreenshotImage((data) => {
		const slot = document.getElementById(`screenshot${data.index}`)
		if (!slot) return

		screenshotData.set(data.index, data)
		slot.style.backgroundImage = `url(data:image/png;base64,${data.data})`
		slot.textContent = ''
		slot.classList.add('active')
	})

	// Handle analysis results
	window.api.onAnalysisResult((markdown) => {
		loading.classList.add('hidden')
		result.innerHTML = marked.parse(markdown)
		result.classList.add('visible')

		// Highlight code blocks
		result.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightElement(block)
		})
	})

	// Handle model changes
	window.api.onModelChanged((info) => {
		if (info === 'no-key') {
			modelInfo.textContent = 'No API Key'
			modelInfo.dataset.model = 'no-key'
		} else {
			modelInfo.textContent = info.model
			modelInfo.dataset.model = info.model
		}
	})

	// Handle mode changes
	window.api.onModeChanged((mode) => {
		modeInfo.textContent = mode === 'code' ? 'Code' : 'General'
		modeInfo.dataset.mode = mode
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
			slot.style.backgroundImage = ''
			slot.textContent = i + 1
			slot.classList.remove('active')
		})
	})

	// Handle screenshot clear
	window.api.onClearScreenshots(() => {
		screenshotData.clear()
		screenshots.querySelectorAll('.screenshot').forEach((slot, i) => {
			slot.style.backgroundImage = ''
			slot.textContent = i + 1
			slot.classList.remove('active')
		})
	})

	// Unused handlers (for compatibility)
	window.api.onScreenshotStatus(() => {})
	window.api.onLanguageDetected(() => {})
	window.api.onGetPrompt(() => 'Analyze this code')
})
