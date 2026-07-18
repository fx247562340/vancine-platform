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
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  KIMI_K3_CANONICAL,
  KIMI_K3_CODE_EXAMPLES,
  KIMI_K3_CREDIT_DISCLAIMER,
  KIMI_K3_OPENCODE_CONFIG,
  copyTextToClipboard,
  getKimiK3CtaDestination,
  getKimiK3Metadata,
} from './landing.js';

describe('classic kimi-k3-api landing contract', () => {
  test('guest CTA retains only UTM attribution', () => {
    assert.equal(
      getKimiK3CtaDestination(
        false,
        '?utm_source=x&utm_campaign=k3&token=never-copy-this',
      ),
      '/register?source=kimi-k3-api&utm_source=x&utm_campaign=k3',
    );
  });

  test('authenticated CTA uses the classic playground route', () => {
    assert.equal(
      getKimiK3CtaDestination(true, '?utm_medium=social'),
      '/console/playground?utm_medium=social',
    );
  });

  test('metadata is localized and canonical is stable', () => {
    assert.equal(getKimiK3Metadata('en').canonical, KIMI_K3_CANONICAL);
    assert.equal(getKimiK3Metadata('zh-CN').canonical, KIMI_K3_CANONICAL);
    assert.match(getKimiK3Metadata('en').title, /Coding Agents/);
    assert.match(getKimiK3Metadata('zh-CN').title, /编程智能体/);
  });

  test('examples use the exact public endpoint and model id', () => {
    for (const example of KIMI_K3_CODE_EXAMPLES) {
      assert.match(
        example.code,
        /https:\/\/vancine\.com\/v1\/chat\/completions/,
      );
      assert.match(example.code, /kimi-k3/);
      assert.doesNotMatch(example.code, /sk-[A-Za-z0-9]/);
    }
    assert.match(KIMI_K3_OPENCODE_CONFIG, /https:\/\/vancine\.com\/v1/);
    assert.match(KIMI_K3_OPENCODE_CONFIG, /\{env:VANCINE_API_KEY\}/);
  });

  test('credit copy includes the usage disclaimer', () => {
    assert.equal(
      KIMI_K3_CREDIT_DISCLAIMER,
      '$1 free credit. No credit card required. Usage varies by model and request.',
    );
  });

  test('clipboard failures are converted to a visible state', async () => {
    assert.equal(await copyTextToClipboard('x'), 'error');
    assert.equal(
      await copyTextToClipboard('x', {
        writeText: async () => {
          throw new Error('blocked');
        },
      }),
      'error',
    );
    assert.equal(
      await copyTextToClipboard('x', { writeText: async () => {} }),
      'copied',
    );
  });
});
