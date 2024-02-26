import { defineConfig } from 'vite'
export default defineConfig({
    build: {
        // No need for manifest, we use fixed names
        manifest: false,
        rollupOptions: {
            // overwrite default .html entry
            input: 'src/game.ts',
            output: {
                entryFileNames: `scripts/[name].js`,
                chunkFileNames: `scripts/chunks/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
                manualChunks: {
                    blockly: ['blockly/core'],
                    pixi: ['pixi.js'],
                    duel: ['./src/duel/duel.ts', './src/duel/duelTest.ts']
                }
            }
        },
    },
    server: {
        host: true
    }
})