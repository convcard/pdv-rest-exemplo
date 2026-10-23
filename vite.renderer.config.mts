import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const raiz = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config
// Telas em Angular (src/angular), compiladas (AOT) dentro do Vite pelo plugin
// da Analog. A raiz do Vite é a pasta do Angular; a saída continua em
// .vite/renderer/main_window, de onde o processo main carrega o index.html.
export default defineConfig({
  root: path.join(raiz, 'src/angular'),
  publicDir: path.join(raiz, 'src/angular/public'),
  build: {
    outDir: path.join(raiz, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
  resolve: {
    // "browser" primeiro: bibliotecas como "qrcode" têm uma versão própria para o navegador
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
  },
  plugins: [
    angular({
      tsconfig: path.join(raiz, 'tsconfig.app.json'),
      workspaceRoot: raiz,
    }),
  ],
});
