/*
Copyright (C) 2025 QuantumNous

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
// Run with: node --test src/components/home/AvailableNowSection.test.js
//
// Source-contract test locking the Available now state contract:
//  - real model count shown whenever status is 'ready' (including 0 featured)
//  - supporting line shown when featured models exist
//  - responsive skeleton count via skeletonCountForWidth (1/2/4)
//  - no hardcoded featured allowlist / fallback model names
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'AvailableNowSection.jsx'), 'utf8');

describe('AvailableNowSection — count & fallback contract', () => {
  test('real model count guarded by status === "ready" (not only featured)', () => {
    assert.match(src, /\{\{count\}\} models available/);
    // Caption must be directly guarded by the ready check so it renders on the
    // 0-featured fallback too (local catalog: 33 models, 0 featured).
    assert.match(
      src,
      /status === 'ready'[\s\S]{0,300}\{\{count\}\} models available/,
      'count caption must be guarded by status === "ready"',
    );
  });

  test('supporting line shown when featured models exist', () => {
    assert.match(src, /Featured models live on the public catalog/);
  });

  test('no hardcoded featured allowlist or fallback model names', () => {
    assert.equal(/featured\s*=\s*\[/.test(src), false);
    for (const name of [
      'kimi',
      'glm',
      'qwen',
      'deepseek',
      'minimax',
      'doubao',
    ]) {
      assert.equal(
        src.toLowerCase().includes(`'${name}`),
        false,
        `must not hardcode model name ${name}`,
      );
    }
  });

  test('skeleton count is responsive (uses skeletonCountForWidth)', () => {
    assert.match(src, /skeletonCountForWidth/);
    assert.match(src, /length:\s*skeletonCount/);
  });
});
