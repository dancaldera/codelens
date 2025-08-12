window.addEventListener('DOMContentLoaded', () => {
	const statusDiv = document.getElementById('status')
	const resultDiv = document.getElementById('analysisResult')
	const screenshotContainer = document.getElementById('screenshotContainer')
	const loadingIndicator = document.getElementById('loadingIndicator')
	const modelIndicator = document.getElementById('modelIndicator')

	const MAX_SCREENSHOTS = 2
	const screenshots = new Map() // Store screenshot data by index

	// Create screenshot thumbnail element
	function createScreenshotThumbnail(index) {
		const thumbnail = document.createElement('div')
		thumbnail.id = `screenshot${index}`
		thumbnail.className = 'screenshot-thumbnail'
		thumbnail.textContent = index.toString()
		thumbnail.dataset.index = index.toString()

		// Add click handler
		thumbnail.addEventListener('click', () => {
			// Screenshot click handler - currently disabled
		})

		return thumbnail
	}

	// Update screenshot container layout
	function updateScreenshotContainer() {
		const existingThumbnails = screenshotContainer.children.length
		const neededThumbnails = MAX_SCREENSHOTS

		// Add thumbnails if needed
		for (let i = existingThumbnails + 1; i <= neededThumbnails; i++) {
			const thumbnail = createScreenshotThumbnail(i)
			screenshotContainer.appendChild(thumbnail)
		}

		// Set container class for vertical layout
		screenshotContainer.className = 'screenshot-container'

		// Auto-resize window based on content
		setTimeout(() => {
			const contentHeight = Math.max(200, document.body.scrollHeight)
			const analysisWidth = resultDiv.scrollWidth
			const screenshotWidth = screenshotContainer.scrollWidth
			const totalWidth = Math.max(500, Math.min(1200, screenshotWidth + analysisWidth + 60))
			window.api.resizeWindow(totalWidth, contentHeight + 20)
		}, 100)
	}

	// Initialize with 2 empty thumbnails
	updateScreenshotContainer()

	// Configure marked.js to use highlight.js for code highlighting
	marked.setOptions({
		highlight: (code, lang) => {
			if (lang && hljs.getLanguage(lang)) {
				return hljs.highlight(code, { language: lang }).value
			}
			return hljs.highlightAuto(code).value
		},
		breaks: true,
	})

	// Screenshot status updates
	window.api.onScreenshotStatus((status) => {
		if (statusDiv) {
			statusDiv.innerText = status
		}
	})

	// Analysis results with markdown rendering
	window.api.onAnalysisResult((result) => {
		// Hide loading indicator
		loadingIndicator.style.display = 'none'

		resultDiv.innerHTML = marked.parse(result)
		// Show the result div when there's content
		resultDiv.style.display = 'block'
		// Apply syntax highlighting to code blocks
		document.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightBlock(block)
		})

		// Auto-resize window to fit content
		setTimeout(() => {
			// Get the full content height including scrollable content
			const containerHeight = document.getElementById('container').scrollHeight
			const bodyHeight = document.body.scrollHeight
			const documentHeight = document.documentElement.scrollHeight
			const contentHeight = Math.max(200, containerHeight, bodyHeight, documentHeight)

			const analysisWidth = Math.min(800, resultDiv.scrollWidth)
			const screenshotWidth = document.querySelector('.screenshot-section').scrollWidth
			const totalWidth = Math.max(600, Math.min(1400, screenshotWidth + analysisWidth + 80))
			window.api.resizeWindow(totalWidth, contentHeight + 40)
		}, 100)
	})

	// Language detection updates (internal only)
	window.api.onLanguageDetected((language) => {
		// Language detection still happens internally but no UI display
		console.log('Language detected:', language)
	})

	// Model change updates
	window.api.onModelChanged((modelInfo) => {
		if (modelIndicator) {
			if (modelInfo === 'no-key') {
				modelIndicator.textContent = 'No key provided'
				modelIndicator.className = 'model-indicator no-key'
			} else {
				const { provider, model } = modelInfo
				modelIndicator.textContent = `${provider}: ${model}`
				// Use base model name for CSS class (remove provider prefix)
				const baseModel = model.includes('/') ? model.split('/').pop() : model
				modelIndicator.className = `model-indicator ${baseModel}`
			}
		}
	})

	// Context reset
	window.api.onContextReset(() => {
		resultDiv.innerHTML = ''
		// Hide the result div when there's no content
		resultDiv.style.display = 'none'
		clearAllScreenshots()

		// Reset window size to default
		window.api.resizeWindow(500, 200)
	})

	// Handle screenshot images
	window.api.onScreenshotImage((imageData) => {
		try {
			// Store screenshot data
			screenshots.set(imageData.index, imageData)

			// Update container if needed
			updateScreenshotContainer()

			// Get or create the target element
			const targetElement = document.getElementById(`screenshot${imageData.index}`)

			if (targetElement) {
				// Display the image
				targetElement.style.backgroundImage = `url(data:image/png;base64,${imageData.data})`
				targetElement.innerHTML = '' // Clear the text
				targetElement.classList.add('active')
				targetElement.classList.remove('error')

				// Store the screenshot data
				targetElement.dataset.index = imageData.index.toString()
				targetElement.dataset.path = imageData.path
			}
		} catch (err) {
			console.error('Error displaying screenshot:', err)
			const targetElement = document.getElementById(`screenshot${imageData.index}`)
			if (targetElement) {
				targetElement.innerHTML = 'Error'
				targetElement.classList.add('error')
				targetElement.classList.remove('active')
			}
		}
	})

	// Clear screenshots
	window.api.onClearScreenshots(() => {
		clearAllScreenshots()
	})

	// Clear all screenshots function
	function clearAllScreenshots() {
		screenshots.clear()
		screenshotContainer.innerHTML = ''
		updateScreenshotContainer()
	}

	// Keyboard shortcut handlers
	document.addEventListener('keydown', (event) => {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault()
			if (screenshots.size > 0) {
				window.api.submitPrompt('analyze')
				loadingIndicator.style.display = 'flex'
			} else {
				if (statusDiv) {
					statusDiv.innerText = 'No screenshots to analyze'
				}
			}
		}
	})

	// Handle get-prompt requests from main process
	window.api.onGetPrompt(() => {
		const predefinedPrompt =
			'You are an expert software developer. Analyze the code in these images, extract it accurately, solve any problems shown, and provide the best practices solution.'

		return predefinedPrompt
	})

	// Listen for show-loading event from main process
	window.api.onShowLoading(() => {
		loadingIndicator.style.display = 'flex'
	})
})
