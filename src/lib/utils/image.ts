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
