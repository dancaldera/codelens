/**
 * Get MIME type based on file extension
 */
export function getMimeType(path: string): string {
	const fileExtension = path.split('.').pop()?.toLowerCase()

	switch (fileExtension) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg'
		case 'gif':
			return 'image/gif'
		case 'webp':
			return 'image/webp'
		default:
			return 'image/png'
	}
}

/**
 * Validate image file size and properties
 */
export function validateImageFile(stats: { size: number }): { isValid: boolean; error?: string } {
	if (stats.size === 0) {
		return { isValid: false, error: 'Image file is empty' }
	}

	if (stats.size > 20 * 1024 * 1024) {
		// 20MB limit
		return { isValid: false, error: 'Image file too large (max 20MB)' }
	}

	return { isValid: true }
}

/** Long-edge cap for screenshots sent to vision models (their internal resize ceiling). */
export const MAX_IMAGE_EDGE = 1568

/** Scale dimensions down so the long edge fits maxEdge, preserving aspect ratio. */
export function capImageSize(
	width: number,
	height: number,
	maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number } {
	const longEdge = Math.max(width, height)
	if (!Number.isFinite(longEdge) || longEdge <= maxEdge || longEdge === 0) return { width, height }
	const scale = maxEdge / longEdge
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** True when the buffer starts with the JPEG SOI marker. */
export function isJpegBuffer(buffer: { length: number; [index: number]: number | undefined }): boolean {
	return buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8
}
