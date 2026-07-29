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
// Run with: node --test src/components/home/homepage-wiring.test.js
//
// Source-contract tests locking the Classic acquisition homepage wiring:
// CTA routes (guest /register, auth /console), analytics locations, evidence
// resource enum, single pricing fetch, composition order, and absence of
// fake hardcoded quantities (20+/50+/100+/10x/11+).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Classic Hero — CTA routes + analytics', () => {
  const src = read('HeroSection.jsx');

  test('guest → /register, authenticated → /console', () => {
    assert.match(src, /authPrimaryPath\('classic'\)/);
    assert.match(src, /guestPrimaryPath\('classic'\)/);
    assert.match(
      src,
      /isAuthenticated\s*\?\s*authPrimaryPath\('classic'\)\s*:\s*guestPrimaryPath\('classic'\)/,
    );
  });

  test('fires get_started_clicked { location: "hero" }', () => {
    assert.match(src, /get_started_clicked[\s\S]{0,60}location:\s*'hero'/);
  });

  test('fires explore_models_clicked { location: "hero" }', () => {
    assert.match(src, /explore_models_clicked[\s\S]{0,60}location:\s*'hero'/);
  });

  test('Hero evergreen copy contains no concrete model names', () => {
    const body = stripComments(src).toLowerCase();
    for (const name of [
      'kimi',
      'glm',
      'minimax',
      'qwen',
      'deepseek',
      'seedance',
      'seedream',
      'doubao',
      'gpt-4',
      'gpt-5',
    ]) {
      assert.equal(body.includes(name), false, `hero must not name ${name}`);
    }
  });
});

describe('Classic Final CTA — route + analytics + credit copy', () => {
  const src = read('CTASection.jsx');

  test('guest → /register, authenticated → /console', () => {
    assert.match(
      src,
      /isAuthenticated\s*\?\s*authPrimaryPath\('classic'\)\s*:\s*guestPrimaryPath\('classic'\)/,
    );
  });

  test('fires get_started_clicked { location: "final_cta" }', () => {
    assert.match(src, /get_started_clicked[\s\S]{0,60}location:\s*'final_cta'/);
  });

  test('offers $1 credit with eligibility qualifier, no "no credit card"', () => {
    assert.match(src, /Get \$1 in free API credit/);
    assert.match(src, /promotional API credit/);
    assert.equal(stripComments(src).includes('No credit card required'), false);
  });
});

describe('Classic header — signup analytics', () => {
  test('UserArea fires get_started_clicked { location: "header" }', () => {
    const src = read('../layout/headerbar/UserArea.jsx');
    assert.match(src, /get_started_clicked[\s\S]{0,60}location:\s*'header'/);
    assert.match(src, /to=['"]\/register['"]/);
  });

  test('PublicMobileNav is accessible (aria + Escape + focus trap)', () => {
    const src = read('../layout/headerbar/PublicMobileNav.jsx');
    assert.match(src, /aria-expanded/);
    assert.match(src, /aria-controls/);
    assert.match(src, /Escape/);
    assert.match(src, /aria-modal/);
  });
});

describe('Classic Marketplace / Available now / Evidence analytics', () => {
  test('Marketplace fires explore_models_clicked { location: "marketplace" }', () => {
    const src = read('MarketplaceSection.jsx');
    assert.match(
      src,
      /explore_models_clicked[\s\S]{0,60}location:\s*'marketplace'/,
    );
    assert.match(src, /to=['"]\/pricing['"]/);
    assert.equal(stripComments(src).includes('11+'), false);
  });

  test('Available now fires featured_model_clicked + fallback explore', () => {
    const src = read('AvailableNowSection.jsx');
    assert.match(
      src,
      /featured_model_clicked[\s\S]{0,90}location:\s*'available_now'/,
    );
    // Fallback passes location='available_now_fallback' to FallbackLink, which
    // fires explore_models_clicked with that location.
    assert.match(src, /available_now_fallback/);
    assert.match(src, /explore_models_clicked/);
  });

  test('Evidence fires evidence_link_clicked with the resource enum', () => {
    const src = read('EvidenceSection.jsx');
    assert.match(src, /evidence_link_clicked/);
    for (const r of ['kimi_k3_page', 'starter_repo', 'verified_json']) {
      assert.match(src, new RegExp(r), `missing resource ${r}`);
    }
  });
});

describe('Classic Home composition — single pricing fetch + order', () => {
  const src = read('../../pages/Home/index.jsx');

  test('exactly one /api/pricing fetch, guarded by a ref', () => {
    const calls = src.match(/API\.get\(['"]\/api\/pricing['"]\)/g) ?? [];
    assert.equal(calls.length, 1, 'pricing must be fetched exactly once');
    assert.match(src, /pricingFetchedRef/);
  });

  test('section order Hero → AvailableNow → Stack → Evidence → Why → Marketplace → CTA', () => {
    const order = [
      '<HeroSection',
      '<AvailableNowSection',
      '<StackSection',
      '<EvidenceSection',
      '<WhySection',
      '<MarketplaceSection',
      '<CTASection',
    ];
    let cursor = -1;
    for (const tag of order) {
      const idx = src.indexOf(tag);
      assert.ok(idx >= 0, `missing ${tag}`);
      assert.ok(idx > cursor, `${tag} out of order`);
      cursor = idx;
    }
  });

  test('legacy sections (Features/Providers/PricingHighlight) not composed', () => {
    assert.equal(src.includes('<FeaturesSection'), false);
    assert.equal(src.includes('<ProvidersSection'), false);
    assert.equal(src.includes('<PricingHighlight'), false);
  });
});

describe('Classic home — no hardcoded fake quantities', () => {
  const files = [
    'HeroSection.jsx',
    'CTASection.jsx',
    'AvailableNowSection.jsx',
    'MarketplaceSection.jsx',
    'WhySection.jsx',
    'StackSection.jsx',
  ];
  const banned = [/20\+/, /50\+/, /100\+/, /10x/i, /11\+/];
  for (const f of files) {
    test(`${f} has no 20+/50+/100+/10x/11+`, () => {
      const src = stripComments(read(f));
      for (const re of banned) {
        assert.equal(re.test(src), false, `${f} must not contain ${re}`);
      }
    });
  }
});
