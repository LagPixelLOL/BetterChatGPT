import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { consoleForwardPlugin } from "vite-console-forward-plugin"

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === "serve" || mode === "development";
  console.log(`Development mode: ${isDev}`);
  return {
    plugins: [
      react(),
      wasm(),
      topLevelAwait(),
      isDev && consoleForwardPlugin(),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@icon/': new URL('./src/assets/icons/', import.meta.url).pathname,
        '@type/': new URL('./src/types/', import.meta.url).pathname,
        '@store/': new URL('./src/store/', import.meta.url).pathname,
        '@hooks/': new URL('./src/hooks/', import.meta.url).pathname,
        '@constants/': new URL('./src/constants/', import.meta.url).pathname,
        '@api/': new URL('./src/api/', import.meta.url).pathname,
        '@components/': new URL('./src/components/', import.meta.url).pathname,
        '@utils/': new URL('./src/utils/', import.meta.url).pathname,
        '@src/': new URL('./src/', import.meta.url).pathname,
      },
    },
    server: { host: true, port: 12345, allowedHosts: true },
  }
});
