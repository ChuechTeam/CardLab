import { defineConfig } from 'vite'
export default defineConfig({
    build: {
        // No need for manifest, we use fixed names
        manifest: false,
        rollupOptions: {
            // overwrite default .html entry
            input: 'src/game.js',
            output: {
                entryFileNames: `scripts/[name].js`,
                chunkFileNames: `scripts/chunks/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
                manualChunks: {
                    blockly: ['blockly/core'],
                }
            }
        },
    },
})