import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: 'dist/main',
			lib: { entry: 'src/main.ts' },
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: 'dist/preload',
			lib: { entry: 'src/preload.ts' },
		},
	},
	renderer: {
		root: '.',
		build: {
			outDir: 'dist/renderer',
			rollupOptions: {
				input: {
					index: 'index.html',
					settings: 'settings.html',
				},
			},
		},
	},
})
