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
// Run with: node --test src/components/home/homepage-pricing.test.js

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizePricingResponse,
  selectFeatured,
  selectMarketplace,
  selectVendors,
  endpointChips,
  guestPrimaryPath,
  authPrimaryPath,
  HERO_EVERGREEN_STRINGS,
  HERO_BANNED_MODEL_SUBSTR,
  FEATURED_FALLBACK_LABEL,
  hasHardcodedFeaturedAllowlist,
} from './homepage-pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('normalizePricingResponse', () => {
  test('success array ready', () => {
    const r = normalizePricingResponse({
      success: true,
      data: [
        { model_name: 'alpha', tags: 'featured', vendor_id: 1 },
        { model_name: 'beta', tags: '' },
      ],
      vendors: [{ id: 1, name: 'Vendor A' }],
    });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'ready');
    assert.equal(r.count, 2);
    assert.equal(r.models.length, 2);
    assert.equal(r.featured.length, 1);
    assert.equal(r.marketplace.length, 2);
    assert.deepEqual(r.vendors, ['Vendor A']);
  });

  test('success empty array', () => {
    const r = normalizePricingResponse({ success: true, data: [] });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'empty');
    assert.equal(r.count, 0);
    assert.deepEqual(r.featured, []);
    assert.deepEqual(r.marketplace, []);
  });

  test('success false → error', () => {
    const r = normalizePricingResponse({ success: false, data: [] });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'error');
    assert.equal(r.count, null);
  });

  test('object-shaped data → error (no Object.keys fake count)', () => {
    const r = normalizePricingResponse({
      success: true,
      data: { 0: { model_name: 'x' }, foo: 1 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'error');
    assert.equal(r.count, null);
  });

  test('filters empty model_name', () => {
    const r = normalizePricingResponse({
      success: true,
      data: [
        { model_name: '  ' },
        { model_name: '' },
        { model_name: 'keep-me' },
        null,
        { tags: 'featured' },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.count, 1);
    assert.equal(r.models[0].model_name, 'keep-me');
  });

  test('null payload → error', () => {
    assert.equal(normalizePricingResponse(null).status, 'error');
    assert.equal(normalizePricingResponse(undefined).status, 'error');
  });
});

describe('selectFeatured', () => {
  const items = [
    { model_name: 'zeta', tags: 'Featured' },
    { model_name: 'alpha', tags: 'featured,new' },
    { model_name: 'beta', tags: 'not-featured' },
    { model_name: 'gamma', tags: ' other , FEATURED ' },
    { model_name: 'delta', tags: 'highlight' },
    { model_name: 'epsilon', tags: 'featured' },
    { model_name: 'eta', tags: 'featured' },
    { model_name: '', tags: 'featured' },
  ];

  test('exact token featured case-insensitive; excludes not-featured; caps to 4', () => {
    const f = selectFeatured(items);
    const names = f.map((m) => m.model_name);
    // excluded by tag rules
    assert.ok(!names.includes('beta'));
    assert.ok(!names.includes('delta'));
    // included by exact featured token
    assert.ok(names.includes('alpha'));
    assert.ok(names.includes('gamma'));
    // 5 valid featured models exist; sorted cap=4 drops the last (zeta)
    assert.ok(!names.includes('zeta'));
    assert.equal(f.length, 4);
  });

  test('sorts case-insensitive by model_name and caps at 4', () => {
    const f = selectFeatured(items);
    assert.equal(f.length, 4);
    const names = f.map((m) => m.model_name);
    assert.deepEqual(
      names,
      [...names].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    );
  });
});

describe('selectMarketplace', () => {
  test('sorts and caps at 6', () => {
    const models = ['m9', 'm1', 'm3', 'm2', 'm5', 'm4', 'm8', 'm7'].map(
      (model_name) => ({ model_name }),
    );
    const m = selectMarketplace(models);
    assert.equal(m.length, 6);
    assert.deepEqual(
      m.map((x) => x.model_name),
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm7'],
    );
  });
});

describe('selectVendors', () => {
  test('sorts names case-insensitive', () => {
    assert.deepEqual(
      selectVendors([
        { id: 1, name: 'zeta' },
        { id: 2, name: 'Alpha' },
        { id: 3, name: 'beta' },
      ]),
      ['Alpha', 'beta', 'zeta'],
    );
  });

  test('non-array / empty / malformed → empty', () => {
    assert.deepEqual(selectVendors(null), []);
    assert.deepEqual(selectVendors({}), []);
    assert.deepEqual(selectVendors([{ id: 1 }, { name: '  ' }]), []);
  });
});

describe('endpointChips', () => {
  test('0 types', () => {
    assert.deepEqual(endpointChips(null), { chips: [], overflow: 0 });
    assert.deepEqual(endpointChips([]), { chips: [], overflow: 0 });
  });

  test('1–2 types', () => {
    assert.deepEqual(endpointChips(['a']), { chips: ['a'], overflow: 0 });
    assert.deepEqual(endpointChips(['a', 'b']), {
      chips: ['a', 'b'],
      overflow: 0,
    });
  });

  test('5 types → first 2 + overflow 3', () => {
    assert.deepEqual(endpointChips(['a', 'b', 'c', 'd', 'e']), {
      chips: ['a', 'b'],
      overflow: 3,
    });
  });
});

describe('CTA paths', () => {
  test('classic guest/auth', () => {
    assert.equal(guestPrimaryPath('classic'), '/register');
    assert.equal(authPrimaryPath('classic'), '/console');
  });

  test('default guest/auth', () => {
    assert.equal(guestPrimaryPath('default'), '/sign-up');
    assert.equal(authPrimaryPath('default'), '/dashboard');
  });
});

describe('Hero evergreen contract', () => {
  test('static evergreen strings contain no banned model substrings', () => {
    const joined = HERO_EVERGREEN_STRINGS.join('\n').toLowerCase();
    for (const ban of HERO_BANNED_MODEL_SUBSTR) {
      assert.equal(
        joined.includes(ban.toLowerCase()),
        false,
        `banned substring present: ${ban}`,
      );
    }
  });

  test('no hardcoded featured allowlist export', () => {
    assert.equal(hasHardcodedFeaturedAllowlist(), false);
  });

  test('fallback label is safe', () => {
    assert.match(FEATURED_FALLBACK_LABEL, /Explore all available models/i);
  });
});

describe('source guard', () => {
  test('homepage-pricing.js has no Object.keys on pricing data path', () => {
    const src = readFileSync(join(__dirname, 'homepage-pricing.js'), 'utf8');
    assert.equal(src.includes('Object.keys'), false);
  });
});
