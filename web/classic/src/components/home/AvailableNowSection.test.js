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

describe('AvailableNowSection — count-driven centered grid contract', () => {
  test('uses featuredGridColumns(count) helper', () => {
    assert.match(src, /featuredGridColumns/);
  });

  test('does not unconditionally render 4 columns for 1-3 featured cards', () => {
    // The count-driven grid must not pin to a fixed 4-col grid outside the
    // skeleton state.
    const countDrivenBlock = src.match(/FeaturedGrid[\s\S]*?<\/div>/);
    assert.ok(countDrivenBlock, 'FeaturedGrid component must exist');
    assert.equal(
      /xl:grid-cols-4/.test(countDrivenBlock[0]),
      false,
      'featured grid must not pin to xl:grid-cols-4',
    );
  });
});

describe('AvailableNowSection — tablet responsive contract (design §3.3)', () => {
  test('tablet + 1 featured card collapses to a single centered column (md:grid-cols-1)', () => {
    const grid = src.match(/FeaturedGrid[\s\S]*?<\/div>/);
    assert.ok(grid, 'FeaturedGrid component must exist');
    assert.match(
      grid[0],
      /featured\.length\s*<=\s*1\s*\?\s*['"]md:grid-cols-1['"]/,
      'tablet + 1 card must use md:grid-cols-1',
    );
  });

  test('tablet + 2/3/4 featured cards collapse to at most 2 centered columns', () => {
    const grid = src.match(/FeaturedGrid[\s\S]*?<\/div>/);
    assert.ok(grid, 'FeaturedGrid component must exist');
    assert.match(
      grid[0],
      /featured\.length\s*<=\s*1\s*\?\s*['"]md:grid-cols-1['"]\s*:\s*['"]md:grid-cols-2['"]/,
      'tablet + 2/3/4 cards must use md:grid-cols-2',
    );
  });

  test('desktop 1/2/3/4 contract preserved (count-driven 1/2/3/4 columns)', () => {
    const grid = src.match(/FeaturedGrid[\s\S]*?<\/div>/);
    assert.ok(grid, 'FeaturedGrid component must exist');
    // Desktop column templates map 1/2/3/4 to grid-cols-1/2/3/4
    assert.match(grid[0], /grid-cols-1/);
    assert.match(grid[0], /grid-cols-2/);
    assert.match(grid[0], /grid-cols-3/);
    assert.match(grid[0], /grid-cols-4/);
  });

  test('mobile always single column (no md: override leaks)', () => {
    // The responsive-grid is assembled from `'grid-cols-1'` for mobile and
    // an md: variant for tablet. We assert on the source pieces directly,
    // since the final className is built dynamically rather than as a single
    // string literal in JSX.
    assert.match(
      src,
      /responsiveGridCols\s*=\s*isMobile\s*\?\s*'grid-cols-1'/,
      'mobile base must be grid-cols-1',
    )
    assert.match(src, /tabletGridCols\s*=\s*[\s\S]*?'md:grid-cols-1'/)
    assert.match(src, /'md:grid-cols-1'\s*:\s*'md:grid-cols-2'/)
  })
});

describe('AvailableNowSection — focus-visible + SpotlightCard', () => {
  test('available-now link has :focus-visible accent ring', () => {
    assert.match(src, /focus-visible:ring/);
    assert.match(src, /focus-visible:ring-\[color:var\(--vc-accent\)\]/);
  });

  test('renders card through SpotlightCard primitive', () => {
    assert.match(src, /import SpotlightCard from ['"]\.\/SpotlightCard['"]/);
    assert.match(src, /<SpotlightCard[\s\S]*?>/);
  });
});
