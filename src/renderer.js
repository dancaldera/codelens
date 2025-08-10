window.addEventListener('DOMContentLoaded', () => {
	const statusDiv = document.getElementById('status')
	const resultDiv = document.getElementById('analysisResult')
	const screenshot1 = document.getElementById('screenshot1')
	const screenshot2 = document.getElementById('screenshot2')
	const loadingIndicator = document.getElementById('loadingIndicator')
	const apiKeyInput = document.getElementById('apiKeyInput')
	const apiKeySaveBtn = document.getElementById('apiKeySaveBtn')

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
		// Apply syntax highlighting to code blocks
		document.querySelectorAll('pre code').forEach((block) => {
			hljs.highlightBlock(block)
		})
	})

	// Language detection updates (internal only)
	window.api.onLanguageDetected((language) => {
		// Language detection still happens internally but no UI display
		console.log('Language detected:', language)
	})

	// Prompt submission feedback
	window.api.onSubmitResult((result) => {
		if (statusDiv) {
			statusDiv.innerText = result
		}
	})

	// Context reset
	window.api.onContextReset(() => {
		if (statusDiv) {
			statusDiv.innerText =
				'⌘+H: Capture • ⌘+G: Reset • ⌘+B: Toggle • ⌘+Arrow: Move • ⌘+1-2: Opacity • ⌘+3-4: Font • ⌘+5-6: Size'
		}
		resultDiv.innerHTML = ''
		// Clear the screenshot thumbnails
		screenshot1.style.backgroundImage = ''
		screenshot1.innerHTML = '1'
		screenshot2.style.backgroundImage = ''
		screenshot2.innerHTML = '2'
		screenshot1.classList.remove('active', 'error')
		screenshot2.classList.remove('active', 'error')
	})

	// Handle screenshot images
	window.api.onScreenshotImage((imageData) => {
		const targetElement = imageData.index === 1 ? screenshot1 : screenshot2

		try {
			// Display the image
			targetElement.style.backgroundImage = `url(data:image/png;base64,${imageData.data})`
			targetElement.innerHTML = '' // Clear the text
			targetElement.classList.add('active')
			targetElement.classList.remove('error')

			// Store the screenshot index as a data attribute
			targetElement.dataset.index = imageData.index
			targetElement.dataset.path = imageData.path

			console.log(`Displayed screenshot ${imageData.index}`)

			// Auto-submit analysis after second screenshot
			if (imageData.index === 2) {
				window.api.submitPrompt('analyze')
				// Show loading indicator
				loadingIndicator.style.display = 'flex'
			}
		} catch (err) {
			console.error('Error displaying screenshot:', err)
			targetElement.innerHTML = 'Error'
			targetElement.classList.add('error')
			targetElement.classList.remove('active')
		}
	})

	// Clear screenshots
	window.api.onClearScreenshots(() => {
		screenshot1.style.backgroundImage = ''
		screenshot1.innerHTML = '1'
		screenshot2.style.backgroundImage = ''
		screenshot2.innerHTML = '2'
		screenshot1.classList.remove('active', 'error')
		screenshot2.classList.remove('active', 'error')
		delete screenshot1.dataset.index
		delete screenshot1.dataset.path
		delete screenshot2.dataset.index
		delete screenshot2.dataset.path
	})

	// Add click handlers for screenshots
	screenshot1.addEventListener('click', () => {
		if (screenshot1.dataset.index) {
			window.api.openScreenshot(parseInt(screenshot1.dataset.index))
		}
	})

	screenshot2.addEventListener('click', () => {
		if (screenshot2.dataset.index) {
			window.api.openScreenshot(parseInt(screenshot2.dataset.index))
		}
	})

	// Handle get-prompt requests from main process
	window.api.onGetPrompt(() => {
		const predefinedPrompt =
			'You are an expert software developer. Analyze the code in these images, extract it accurately, solve any problems shown, and provide the best practices solution.'

		console.log(`Using predefined prompt: ${predefinedPrompt}`)
		return predefinedPrompt
	})

	// Listen for show-loading event from main process
	window.api.onShowLoading(() => {
		loadingIndicator.style.display = 'flex'
	})

	// Handle font size changes
	let fontSizeFactor = 1.0 // Default size factor
	const fontSizeStep = 0.15 // 15% increase/decrease per step

	window.api.onChangeFontSize((direction) => {
		if (direction === 'increase') {
			fontSizeFactor = Math.min(2.0, fontSizeFactor + fontSizeStep) // Max 2x size
		} else if (direction === 'decrease') {
			fontSizeFactor = Math.max(0.7, fontSizeFactor - fontSizeStep) // Min 0.7x size
		}

		// Update CSS variables based on the new font size factor
		document.documentElement.style.setProperty('--base-font-size', `${Math.round(13 * fontSizeFactor)}px`)
		document.documentElement.style.setProperty('--code-font-size', `${Math.round(12 * fontSizeFactor)}px`)
		document.documentElement.style.setProperty('--small-font-size', `${Math.round(11 * fontSizeFactor)}px`)
		document.documentElement.style.setProperty('--header-font-size', `${Math.round(14 * fontSizeFactor)}px`)

		console.log(`Font size factor: ${fontSizeFactor.toFixed(2)}`)
	})

	// API Key handling
	apiKeySaveBtn.addEventListener('click', () => {
		const apiKey = apiKeyInput.value.trim()
		if (apiKey) {
			window.api.saveApiKey(apiKey)
			// Mask the API key for security
			apiKeyInput.value = '••••••••••••••••••••••••••'
			// Hide the API key container when API key is saved
			document.querySelector('.api-key-container').style.display = 'none'
			if (statusDiv) {
				statusDiv.innerText = 'API key saved successfully'
			}
		} else {
			if (statusDiv) {
				statusDiv.innerText = 'Please enter a valid API key'
			}
		}
	})

	// Load saved API key on startup
	window.api.getApiKey().then((apiKey) => {
		if (apiKey) {
			// Show masked characters instead of the actual key
			apiKeyInput.value = '••••••••••••••••••••••••••'
			// Hide the API key container when API key is already saved
			document.querySelector('.api-key-container').style.display = 'none'
		}
	})

	// Initial status text
	if (statusDiv) {
		statusDiv.innerText =
			'⌘+H: Capture • ⌘+G: Reset • ⌘+B: Toggle • ⌘+Arrow: Move • ⌘+1-2: Opacity • ⌘+3-4: Font • ⌘+5-6: Size'
	}
})
