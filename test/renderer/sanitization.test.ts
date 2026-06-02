import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { marked } from 'marked'
import { describe, expect, test } from 'vitest'

function sanitizeMarkdown(markdown: string): string {
	const window = new JSDOM('').window
	const purifier = createDOMPurify(window)
	return purifier.sanitize(marked.parse(markdown, { async: false }), {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['class'],
	})
}

describe('renderer Markdown sanitization', () => {
	test('removes executable HTML from model output', () => {
		const html = sanitizeMarkdown('# Result\n<img src=x onerror="globalThis.pwned = true"><script>alert(1)</script>')

		expect(html).toContain('<h1>Result</h1>')
		expect(html).not.toContain('onerror')
		expect(html).not.toContain('<script>')
	})
})
