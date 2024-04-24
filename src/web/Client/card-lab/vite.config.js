import { defineConfig } from 'vite'
export default defineConfig({
    build: {
        manifest: true,
        rollupOptions: {
            // overwrite default .html entry
            input: ['src/game.ts', 'src/style.css'],
            output: {
                entryFileNames: `scripts/[name].js`,
                chunkFileNames: `scripts/chunks/[name].js`,
                assetFileNames: `assets/[name].[ext]`
            }
        },
        assetsInlineLimit: (filePath, content) => {
            if (filePath.endsWith('.css')) {
                return false
            }
            return content.length < 8192
        },
    },
    server: {
        host: true
    },
    resolve: {
        alias: {
            src: "/src",
        },
    },
})