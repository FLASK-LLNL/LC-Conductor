import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules', 'dist'],
    }),
    {
      name: 'copy-style-css',
      closeBundle() {
        const src = resolve(__dirname, 'src/style.css');
        const dest = resolve(__dirname, 'dist/style.css');
        copyFileSync(src, dest);
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'LCCConductor',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'lucide-react',
        'react-markdown',
        'remark-gfm',
        'react-syntax-highlighter',
        'react-syntax-highlighter/dist/esm/styles/prism',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'LucideReact',
          'react-markdown': 'ReactMarkdown',
          'remark-gfm': 'remarkGfm',
          'react-syntax-highlighter': 'SyntaxHighlighter',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
