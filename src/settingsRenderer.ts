// CodeLens Settings Renderer - TypeScript
import type { ProviderInfo } from './ipc'
import '../styles/settings.css'

window.addEventListener('DOMContentLoaded', () => {
	const providerSelect = document.getElementById('provider') as HTMLSelectElement | null
	const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement | null
	const keyLabel = document.getElementById('keyLabel')
	const capabilities = document.getElementById('capabilities')
	const saveButton = document.getElementById('save') as HTMLButtonElement | null
	const closeButton = document.getElementById('close') as HTMLButtonElement | null
	const status = document.getElementById('status')

	if (!providerSelect || !apiKeyInput || !keyLabel || !capabilities || !saveButton || !closeButton || !status) {
		console.error('Required settings DOM elements not found')
		return
	}

	const select = providerSelect
	const keyInput = apiKeyInput
	const label = keyLabel
	const hint = capabilities
	const save = saveButton
	const statusEl = status

	let providers: ProviderInfo[] = []
	const editedKeys: Record<string, string> = {}

	function currentProvider(): ProviderInfo | undefined {
		return providers.find((provider) => provider.id === select.value)
	}

	function capabilityHint(provider: ProviderInfo): string {
		const vision = provider.vision ? 'screenshots' : 'no image support'
		const stt = provider.transcription ? 'voice notes' : 'no voice transcription'
		return `${provider.label} — ${vision}, ${stt}`
	}

	function syncProviderFields(): void {
		const provider = currentProvider()
		if (!provider) return

		label.textContent = `${provider.label} API key`
		keyInput.value = editedKeys[provider.envKey] ?? ''
		keyInput.placeholder = `${provider.envKey}`
		hint.textContent = capabilityHint(provider)
	}

	function stashCurrentKey(): void {
		const provider = currentProvider()
		if (provider) {
			editedKeys[provider.envKey] = keyInput.value.trim()
		}
	}

	function setStatus(message: string, kind: 'ok' | 'error' | ''): void {
		statusEl.textContent = message
		statusEl.className = kind
	}

	select.addEventListener('change', () => {
		stashCurrentKey()
		syncProviderFields()
	})

	keyInput.addEventListener('input', stashCurrentKey)

	closeButton.addEventListener('click', () => window.api.closeWindow())

	save.addEventListener('click', () => {
		stashCurrentKey()
		save.disabled = true
		setStatus('Saving…', '')

		const keys = Object.entries(editedKeys).map(([envKey, value]) => ({ envKey, value }))
		window.api
			.saveSettingsConfig({ provider: select.value, keys })
			.then((result) => {
				setStatus(
					result.ok ? 'Saved — provider reloaded.' : `Save failed: ${result.error ?? 'unknown error'}`,
					result.ok ? 'ok' : 'error',
				)
			})
			.catch((error) => {
				setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'error')
			})
			.finally(() => {
				save.disabled = false
			})
	})

	void window.api
		.getSettingsConfig()
		.then((config) => {
			if (!config) {
				setStatus('Failed to load settings.', 'error')
				return
			}
			const storageHint = document.getElementById('storageHint')
			if (storageHint) {
				storageHint.textContent = config.secureStorage
					? 'Saved to your OS keychain — encrypted, never leaves this machine except to your provider.'
					: 'OS keychain unavailable — saved to .env in plaintext.'
			}
			providers = config.providers
			Object.assign(editedKeys, config.keys)

			select.replaceChildren(
				...providers.map((provider) => {
					const option = document.createElement('option')
					option.value = provider.id
					option.textContent = provider.label
					return option
				}),
			)
			select.value = config.provider
			syncProviderFields()
		})
		.catch((error) => {
			setStatus(`Failed to load settings: ${error instanceof Error ? error.message : String(error)}`, 'error')
		})
})
