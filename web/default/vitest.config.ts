/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Component/behavior tests (React Testing Library + jsdom) live in
// `src/features/docs/__tests__` and use the `.test.tsx` extension. The pure
// logic `*.test.ts` suites keep running under `node --test` (see package.json
// `test:unit`); scoping `include` here keeps the two runners from overlapping.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/features/docs/__tests__/**/*.test.tsx',
      'src/features/wallet/**/*.test.tsx',
      'src/features/system-settings/**/*.test.tsx',
    ],
    css: false,
  },
})
