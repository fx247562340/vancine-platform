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

For commercial licensing, please contact support@quantumnous.com.
*/
import { describe, expect, it } from 'vitest'

import { isVideoArtifactCapabilityUrl } from '../task'

// One real fixture used across the matrix: 43 URL-safe Base64 characters,
// exactly what service.IssueTaskArtifactAccess emits
// (base64.RawURLEncoding of a 32-byte HMAC-SHA256).
const TOKEN = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const PATH = '/v1/tasks/t1/artifacts/a1/content'
const GOOD = `https://media.test${PATH}?access=${TOKEN}`

describe('isVideoArtifactCapabilityUrl accepts the backend URL shape', () => {
  it('accepts a domain-root capability URL', () => {
    expect(isVideoArtifactCapabilityUrl(GOOD, 't1', 'a1')).toBe(true)
  })

  it('accepts a TaskPublicAddress base-path prefix', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/prefix${PATH}?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(true)
  })

  it('accepts a base path that contains a legitimate @ (not userinfo)', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.example/media@v1${PATH}?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(true)
  })

  it('accepts http and an explicit port', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `http://media.test:8080${PATH}?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(true)
  })

  it('does not require the app origin (media domain is allowed)', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://admin-configured-cdn.example${PATH}?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(true)
  })
})

describe('isVideoArtifactCapabilityUrl rejects a different capability', () => {
  it('rejects a URL bound to another artifact key', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/t1/artifacts/a2/content?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(false)
  })

  it('rejects a URL bound to another task id', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/t9/artifacts/a1/content?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(false)
  })

  it('rejects a fuzzy substring that is not the capability suffix', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/t1/artifacts/a1/content?access=${TOKEN}&x=1`,
        't1',
        'a1'
      )
    ).toBe(false)
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/t1/artifacts/a1/contentish?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(false)
  })

  it('rejects a nested second capability path in the base prefix', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/other/artifacts/x/content${PATH}?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(false)
  })
})

describe('isVideoArtifactCapabilityUrl rejects fragments', () => {
  // new URL('...#') leaves hash empty, so only the raw-string check catches
  // the bare separator; the two non-empty cases are caught by both layers.
  it.each([
    ['a bare trailing separator', `${GOOD}#`],
    ['a named fragment', `${GOOD}#fragment`],
    ['a media time fragment', `${GOOD}#t=1`],
  ])('rejects a legal URL plus %s', (_label, url) => {
    expect(url).not.toBe(GOOD)
    expect(isVideoArtifactCapabilityUrl(url, 't1', 'a1')).toBe(false)
  })
})

describe('isVideoArtifactCapabilityUrl rejects raw-query tricks', () => {
  const cases: Array<[string, string]> = [
    [
      'a percent-encoded parameter name',
      `https://media.test${PATH}?%61ccess=${TOKEN}`,
    ],
    [
      'another encoded parameter name',
      `https://media.test${PATH}?%41ccess=${TOKEN}`,
    ],
    [
      'a percent-encoded token character',
      `https://media.test${PATH}?access=${TOKEN.slice(0, 41)}%7E`,
    ],
    ['a padded token with %3D', `https://media.test${PATH}?access=${TOKEN}%3D`],
    ['a trailing ampersand', `https://media.test${PATH}?access=${TOKEN}&`],
    [
      'a duplicated access parameter',
      `https://media.test${PATH}?access=${TOKEN}&access=${TOKEN}`,
    ],
    ['an extra parameter', `https://media.test${PATH}?access=${TOKEN}&token=x`],
    ['an empty access value', `https://media.test${PATH}?access=`],
    ['no access parameter at all', `https://media.test${PATH}`],
    ['a different parameter only', `https://media.test${PATH}?token=${TOKEN}`],
    [
      'a form-decoded plus in the token',
      `https://media.test${PATH}?access=${TOKEN.slice(0, 42)}+`,
    ],
    [
      'a slash inside the token',
      `https://media.test${PATH}?access=${TOKEN.slice(0, 42)}/`,
    ],
    [
      'a too-short token',
      `https://media.test${PATH}?access=${TOKEN.slice(0, 42)}`,
    ],
    ['a too-long token', `https://media.test${PATH}?access=${TOKEN}A`],
    [
      'a fragment after the query',
      `https://media.test${PATH}?access=${TOKEN}#t=1`,
    ],
    ['a bare fragment', `https://media.test${PATH}#fragment`],
  ]

  it.each(cases)('rejects %s', (_label, url) => {
    expect(isVideoArtifactCapabilityUrl(url, 't1', 'a1')).toBe(false)
  })
})

describe('isVideoArtifactCapabilityUrl rejects authority userinfo', () => {
  it.each([
    ['username only', `https://user@media.test${PATH}?access=${TOKEN}`],
    [
      'username and password',
      `https://user:pass@media.test${PATH}?access=${TOKEN}`,
    ],
    ['empty userinfo marker', `https://@media.test${PATH}?access=${TOKEN}`],
    [
      'userinfo with encoded colon',
      `https://user%3Apass@media.test${PATH}?access=${TOKEN}`,
    ],
  ])('rejects %s', (_label, url) => {
    expect(isVideoArtifactCapabilityUrl(url, 't1', 'a1')).toBe(false)
  })
})

describe('isVideoArtifactCapabilityUrl rejects malformed or unsafe URLs', () => {
  const cases: Array<[string, unknown]> = [
    ['an empty string', ''],
    ['leading whitespace', ` ${GOOD}`],
    ['trailing whitespace', `${GOOD} `],
    ['a leading tab', `\t${GOOD}`],
    ['an embedded NUL', `https://media.test${PATH}\u0000?access=${TOKEN}`],
    ['an embedded CR', `https://media.test${PATH}?access=${TOKEN}\r`],
    [
      'a backslash in the path',
      `https://media.test/v1/tasks/t1/artifacts\\a1/content?access=${TOKEN}`,
    ],
    ['a non-http protocol', `ftp://media.test${PATH}?access=${TOKEN}`],
    ['a javascript URL', `javascript:alert(1)`],
    ['a relative URL', `${PATH}?access=${TOKEN}`],
    ['a protocol-relative URL', `//media.test${PATH}?access=${TOKEN}`],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { url: GOOD }],
  ]

  it.each(cases)('rejects %s', (_label, url) => {
    expect(isVideoArtifactCapabilityUrl(url, 't1', 'a1')).toBe(false)
  })

  it('rejects an encoded slash inside the path', () => {
    expect(
      isVideoArtifactCapabilityUrl(
        `https://media.test/v1/tasks/t1/artifacts/a1%2fcontent?access=${TOKEN}`,
        't1',
        'a1'
      )
    ).toBe(false)
  })
})
