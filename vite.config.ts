import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Absolute path so the @use resolves from any component, whatever directory it sits in.
const tokensPath = fileURLToPath(new URL('./src/lib/styles/tokens', import.meta.url));

export default defineConfig({
  plugins: [
    sveltekit({
      // Runs <style lang="scss"> through Vite's CSS pipeline (sass-embedded + additionalData below).
      preprocess: vitePreprocess(),
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },
      // SvelteKit 3 is configured here instead of in svelte.config.js (which it no longer supports).
      adapter: adapter()
    })
  ],
  server: {
    // Fixed port so this app never collides with other local Vite apps on 5173.
    port: 5174,
    strictPort: true
  },
  css: {
    preprocessorOptions: {
      scss: {
        // The token layer (variables + mixins only, never globals) is available in every
        // <style lang="scss"> without an explicit @use. See src/lib/styles/_tokens.scss.
        additionalData: `@use '${tokensPath}' as *;\n`
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
