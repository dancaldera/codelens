import { describe, expect, test, vi } from 'vitest'

vi.mock('electron', () => ({
	app: { isPackaged: false, getPath: () => '/tmp/test-logs' },
}))

import { upsertEnv } from '../../src/main/configStore'

describe('upsertEnv', () => {
	test('updates existing keys in place and preserves other lines', () => {
		const content = '# comment\nOPENROUTER_API_KEY=old-key\nLOG_LEVEL=debug\n'
		const result = upsertEnv(content, { OPENROUTER_API_KEY: 'new-key' })

		expect(result).toBe('# comment\nOPENROUTER_API_KEY=new-key\nLOG_LEVEL=debug\n')
	})

	test('appends keys that do not exist yet', () => {
		const result = upsertEnv('LOG_LEVEL=info\n', { DEEPSEEK_API_KEY: 'sk-abc', CODELENS_PROVIDER: 'deepseek' })

		expect(result).toBe('LOG_LEVEL=info\nDEEPSEEK_API_KEY=sk-abc\nCODELENS_PROVIDER=deepseek\n')
	})

	test('handles export-prefixed entries and whitespace', () => {
		const result = upsertEnv('export OPENAI_API_KEY=old\n', { OPENAI_API_KEY: 'sk-new' })

		expect(result).toBe('OPENAI_API_KEY=sk-new\n')
	})

	test('works on an empty file', () => {
		const result = upsertEnv('', { OPENROUTER_API_KEY: 'sk-abc' })

		expect(result).toBe('OPENROUTER_API_KEY=sk-abc\n')
	})

	test('drops lines whose keys are in the remove set', () => {
		const content = 'OPENAI_API_KEY=plaintext\nLOG_LEVEL=debug\n'
		const result = upsertEnv(content, { CODELENS_PROVIDER: 'openai' }, new Set(['OPENAI_API_KEY']))

		expect(result).toBe('LOG_LEVEL=debug\nCODELENS_PROVIDER=openai\n')
	})
})
