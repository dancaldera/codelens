import { describe, expect, test } from 'vitest'
import { capImageSize, getMimeType, isJpegBuffer, MAX_IMAGE_EDGE, validateImageFile } from '../../../src/lib/utils/image'

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

describe('capImageSize', () => {
	test('caps the long edge of a retina screenshot preserving aspect ratio', () => {
		expect(capImageSize(2880, 1800)).toEqual({ width: MAX_IMAGE_EDGE, height: 980 })
	})
	test('leaves smaller images untouched', () => {
		expect(capImageSize(1440, 900)).toEqual({ width: 1440, height: 900 })
	})
	test('caps portrait images by height', () => {
		expect(capImageSize(1000, 3136)).toEqual({ width: 500, height: MAX_IMAGE_EDGE })
	})
})

describe('isJpegBuffer', () => {
	test('detects the JPEG SOI marker only', () => {
		expect(isJpegBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
		expect(isJpegBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
		expect(isJpegBuffer(Buffer.alloc(0))).toBe(false)
	})
})
})
