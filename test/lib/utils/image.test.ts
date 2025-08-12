import { describe, expect, test } from 'bun:test'
import { getMimeType, validateImageFile } from '../../../src/lib/utils/image'

describe('Image utilities', () => {
	describe('getMimeType', () => {
		test('should return image/jpeg for jpg extension', () => {
			expect(getMimeType('image.jpg')).toBe('image/jpeg')
		})

		test('should return image/jpeg for jpeg extension', () => {
			expect(getMimeType('image.jpeg')).toBe('image/jpeg')
		})

		test('should return image/gif for gif extension', () => {
			expect(getMimeType('image.gif')).toBe('image/gif')
		})

		test('should return image/webp for webp extension', () => {
			expect(getMimeType('image.webp')).toBe('image/webp')
		})

		test('should return image/png for png extension', () => {
			expect(getMimeType('image.png')).toBe('image/png')
		})

		test('should return image/png for unknown extensions', () => {
			expect(getMimeType('image.bmp')).toBe('image/png')
		})

		test('should return image/png for files without extension', () => {
			expect(getMimeType('image')).toBe('image/png')
		})

		test('should handle uppercase extensions', () => {
			expect(getMimeType('image.JPG')).toBe('image/jpeg')
			expect(getMimeType('image.JPEG')).toBe('image/jpeg')
			expect(getMimeType('image.GIF')).toBe('image/gif')
		})

		test('should handle paths with multiple dots', () => {
			expect(getMimeType('/path/to/my.image.jpg')).toBe('image/jpeg')
		})
	})

	describe('validateImageFile', () => {
		test('should reject empty files', () => {
			const result = validateImageFile({ size: 0 })
			expect(result.isValid).toBe(false)
			expect(result.error).toBe('Image file is empty')
		})

		test('should reject files larger than 20MB', () => {
			const result = validateImageFile({ size: 21 * 1024 * 1024 })
			expect(result.isValid).toBe(false)
			expect(result.error).toBe('Image file too large (max 20MB)')
		})

		test('should accept files exactly at 20MB limit', () => {
			const result = validateImageFile({ size: 20 * 1024 * 1024 })
			expect(result.isValid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		test('should accept normal file sizes', () => {
			const result = validateImageFile({ size: 1024 * 1024 }) // 1MB
			expect(result.isValid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		test('should accept small files', () => {
			const result = validateImageFile({ size: 1024 }) // 1KB
			expect(result.isValid).toBe(true)
			expect(result.error).toBeUndefined()
		})
	})
})
