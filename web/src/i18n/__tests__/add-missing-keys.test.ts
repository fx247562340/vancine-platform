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
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, test } from 'node:test'

/**
 * Fail-closed contract tests for scripts/add-missing-keys.mjs.
 *
 * The script is the only sanctioned writer of locale JSON keys, so its
 * failure modes must never corrupt a locale file:
 *
 *   - every entry must explicitly provide all seven locales — a missing
 *     locale aborts with a non-zero exit BEFORE any file is written;
 *   - there is no implicit English fallback for missing translations;
 *   - on success only the explicit keys change; unrelated keys and
 *     values stay byte-identical;
 *   - existing keys are never overwritten unless --force is passed.
 *
 * Each test runs the real script in a child process against a throwaway
 * fixture directory (ADD_MISSING_KEYS_LOCALES_DIR), never the repo's
 * locale files.
 */

const WEB_ROOT = resolve(import.meta.dirname, '..', '..', '..')
const SCRIPT = join(WEB_ROOT, 'scripts', 'add-missing-keys.mjs')
const LOCALES = ['en', 'zh', 'zh-TW', 'fr', 'ru', 'ja', 'vi']

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

function runScript(
  args: string[],
  dir: string,
  extraEnv: Record<string, string> = {}
): RunResult {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: WEB_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ADD_MISSING_KEYS_LOCALES_DIR: dir, ...extraEnv },
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function makeFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'add-missing-keys-'))
  for (const locale of LOCALES) {
    writeFileSync(
      join(dir, `${locale}.json`),
      `${JSON.stringify(
        {
          translation: {
            'Existing key': `existing-value-${locale}`,
            'Unrelated key': `unrelated-value-${locale}`,
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    )
  }
  return dir
}

function snapshot(dir: string): Map<string, string> {
  const snap = new Map<string, string>()
  for (const locale of LOCALES) {
    snap.set(locale, readFileSync(join(dir, `${locale}.json`), 'utf8'))
  }
  return snap
}

function assertFilesUnchanged(dir: string, before: Map<string, string>): void {
  for (const locale of LOCALES) {
    assert.equal(
      readFileSync(join(dir, `${locale}.json`), 'utf8'),
      before.get(locale),
      `${locale}.json must not change on a rejected run`
    )
  }
}

// The commit path may only ever leave the seven locale files (plus any
// files the test itself placed there) in the directory: every *.tmp
// artifact a run creates must be swept on both success and failure.
function assertNoTempArtifacts(
  dir: string,
  context: string,
  extra: string[] = []
): void {
  const expected = [
    ...LOCALES.map((locale) => `${locale}.json`),
    ...extra,
  ].sort()
  assert.deepEqual(
    readdirSync(dir).sort(),
    expected,
    `${context}: directory must contain exactly the expected files`
  )
}

function explicitEntryArgs(key: string): string[] {
  const args = ['--key', key]
  for (const locale of LOCALES) {
    args.push(`--${locale}`, `${key} :: ${locale}`)
  }
  return args
}

describe('add-missing-keys fail-closed contract', () => {
  test('rejects an entry missing a locale and writes no file', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      // All locales except "fr" — must abort before touching any file.
      const args = ['--key', 'New key']
      for (const locale of LOCALES.filter((l) => l !== 'fr')) {
        args.push(`--${locale}`, `New key :: ${locale}`)
      }
      const run = runScript(args, dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assert.match(run.stderr, /fr/)
      assertFilesUnchanged(dir, before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects an unknown locale flag and writes no file', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const args = explicitEntryArgs('New key')
      args.push('--de', 'New key :: de')
      const run = runScript(args, dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assertFilesUnchanged(dir, before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects a duplicate key within one invocation', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const args = [
        ...explicitEntryArgs('Dup key'),
        ...explicitEntryArgs('Dup key'),
      ]
      const run = runScript(args, dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assertFilesUnchanged(dir, before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('success writes only the explicit keys; unrelated keys stay identical', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const run = runScript(explicitEntryArgs('New key'), dir)
      assert.equal(run.status, 0, `stderr: ${run.stderr}`)

      for (const locale of LOCALES) {
        const table = JSON.parse(
          readFileSync(join(dir, `${locale}.json`), 'utf8')
        ).translation
        assert.equal(
          table['New key'],
          `New key :: ${locale}`,
          `${locale}.json must carry the explicit value`
        )
        assert.equal(table['Existing key'], `existing-value-${locale}`)
        assert.equal(table['Unrelated key'], `unrelated-value-${locale}`)
        assert.deepEqual(
          Object.keys(table).sort(),
          ['Existing key', 'New key', 'Unrelated key'],
          `${locale}.json must not gain or lose unrelated keys`
        )
      }
      // The successful run changed every file exactly where it had to.
      let changed = 0
      for (const locale of LOCALES) {
        if (
          readFileSync(join(dir, `${locale}.json`), 'utf8') !==
          before.get(locale)
        ) {
          changed++
        }
      }
      assert.equal(changed, LOCALES.length)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('existing keys are never overwritten without --force', () => {
    const dir = makeFixtureDir()
    try {
      const first = runScript(explicitEntryArgs('New key'), dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = snapshot(dir)

      // Same key, different values, no --force: everything is skipped.
      const args = ['--key', 'New key']
      for (const locale of LOCALES) {
        args.push(`--${locale}`, `OVERWRITE :: ${locale}`)
      }
      const second = runScript(args, dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.match(second.stdout, /skipped 7/)
      assertFilesUnchanged(dir, afterFirst)

      // With --force the explicit values replace the previous ones.
      const third = runScript([...args, '--force'], dir)
      assert.equal(third.status, 0, `stderr: ${third.stderr}`)
      for (const locale of LOCALES) {
        const table = JSON.parse(
          readFileSync(join(dir, `${locale}.json`), 'utf8')
        ).translation
        assert.equal(table['New key'], `OVERWRITE :: ${locale}`)
        assert.equal(table['Existing key'], `existing-value-${locale}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('add-missing-keys invalid locale structure fails closed', () => {
  // Every shape that must be rejected: the JSON root and the
  // translation value are both required to be plain objects. Each case
  // corrupts ONE locale file; the run must exit non-zero, all seven
  // files must stay byte-identical, and the error must name the locale
  // without echoing the file's content.
  const INVALID_BODIES: ReadonlyArray<[string, string, string]> = [
    // [case name, raw file body, distinctive content marker that must not leak]
    ['root is an array', '[1, 2, 3]', '[1, 2, 3]'],
    ['root is a string', '"just a string"', 'just a string'],
    ['root is a number', '42', ''],
    ['translation is missing', '{"other": 1}', '"other"'],
    ['translation is null', '{"translation": null}', ''],
    ['translation is an array', '{"translation": []}', ''],
    ['translation is a string', '{"translation": "x"}', '"x"'],
    ['translation is a number', '{"translation": 42}', ''],
  ]

  for (const [name, body, marker] of INVALID_BODIES) {
    test(`rejects a locale file whose ${name} and writes nothing`, () => {
      const dir = makeFixtureDir()
      try {
        writeFileSync(join(dir, 'fr.json'), body, 'utf8')
        // Snapshot AFTER the intentional corruption: the run must leave
        // every file — including the corrupt one — byte-identical.
        const before = snapshot(dir)
        const run = runScript(explicitEntryArgs('New key'), dir)
        assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
        assert.match(
          run.stderr,
          /fr/,
          `error must name the offending locale (fr): ${run.stderr}`
        )
        if (marker !== '') {
          assert.ok(
            !run.stderr.includes(marker),
            `error must not echo file content (marker ${JSON.stringify(marker)}): ${run.stderr}`
          )
        }
        assertFilesUnchanged(dir, before)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

describe('add-missing-keys write failure rolls back all seven files', () => {
  // The failure-injection contract: ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE
  // names one supported locale whose replace step fails. The run must
  // exit non-zero, every already-replaced locale file must be restored
  // to its original bytes, and no script-created temp artifacts may
  // survive. This is NOT a claim of true multi-file transactions — it is
  // "after rollback, the seven target files are back to a consistent
  // original state".
  const injectedFailures = LOCALES.map((target) => target)

  for (const target of injectedFailures) {
    test(`injected failure at ${target} restores all seven original bytes`, () => {
      const dir = makeFixtureDir()
      const before = snapshot(dir)
      try {
        const run = runScript(explicitEntryArgs('New key'), dir, {
          ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE: target,
        })
        assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
        assertFilesUnchanged(dir, before)
        assertNoTempArtifacts(dir, `rollback after failure at ${target}`)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  test('injection with an unsupported locale value is rejected without writes', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const run = runScript(explicitEntryArgs('New key'), dir, {
        ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE: 'de',
      })
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assertFilesUnchanged(dir, before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('without injection the success path leaves no temp artifacts', () => {
    const dir = makeFixtureDir()
    try {
      const run = runScript(explicitEntryArgs('New key'), dir)
      assert.equal(run.status, 0, `stderr: ${run.stderr}`)
      assertNoTempArtifacts(dir, 'successful commit')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('add-missing-keys rejects known-flag tokens used as values', () => {
  // A locale flag must be followed by a real translation token. If the
  // next token is --key, --force, or any supported locale flag, the
  // value is MISSING and the whole run is rejected before any write.
  // Plain translation text may still start with a single hyphen.
  const BAD_VALUE_CASES: ReadonlyArray<[string, string[]]> = [
    [
      '--force after a locale flag',
      [
        '--key',
        'K1',
        '--en',
        'e',
        '--zh',
        'z',
        '--zh-TW',
        't',
        '--fr',
        'f',
        '--ru',
        'r',
        '--ja',
        'j',
        '--vi',
        '--force',
      ],
    ],
    [
      '--key after a locale flag',
      [
        '--key',
        'K1',
        '--en',
        'e',
        '--zh',
        'z',
        '--zh-TW',
        't',
        '--fr',
        '--key',
        'Next',
        '--ru',
        'r',
        '--ja',
        'j',
        '--vi',
        'v',
      ],
    ],
    [
      'another locale flag after a locale flag',
      [
        '--key',
        'K1',
        '--en',
        '--zh',
        'e z',
        '--zh-TW',
        't',
        '--fr',
        'f',
        '--ru',
        'r',
        '--ja',
        'j',
        '--vi',
        'v',
      ],
    ],
    [
      'locale flag with no token at all',
      [
        '--key',
        'K1',
        '--en',
        'e',
        '--zh',
        'z',
        '--zh-TW',
        't',
        '--fr',
        'f',
        '--ru',
        'r',
        '--ja',
        'j',
        '--vi',
      ],
    ],
  ]

  for (const [name, args] of BAD_VALUE_CASES) {
    test(`rejects ${name} and writes no file`, () => {
      const dir = makeFixtureDir()
      const before = snapshot(dir)
      try {
        const run = runScript(args, dir)
        assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
        assertFilesUnchanged(dir, before)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  test('accepts translation text that starts with a single hyphen', () => {
    const dir = makeFixtureDir()
    try {
      const args = ['--key', 'K1']
      for (const locale of LOCALES) {
        args.push(`--${locale}`, `- up to 50% cheaper :: ${locale}`)
      }
      const run = runScript(args, dir)
      assert.equal(run.status, 0, `stderr: ${run.stderr}`)
      for (const locale of LOCALES) {
        const table = JSON.parse(
          readFileSync(join(dir, `${locale}.json`), 'utf8')
        ).translation
        assert.equal(table['K1'], `- up to 50% cheaper :: ${locale}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('empty and whitespace-only values are still rejected', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const args = [
        '--key',
        'K1',
        '--en',
        'e',
        '--zh',
        ' ',
        '--zh-TW',
        't',
        '--fr',
        'f',
        '--ru',
        'r',
        '--ja',
        'j',
        '--vi',
        'v',
      ]
      const run = runScript(args, dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assertFilesUnchanged(dir, before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('add-missing-keys rejects any option token as a value', () => {
  // rev3 boundary rule: the value of --key or of any locale flag must
  // not be an option token — a token starting with "--" — whether or
  // not the script knows that flag. Unknown flags like --de or
  // --unknown must fail closed too. Single-hyphen translation text
  // remains valid (covered in the known-flag describe above).
  const sevenValues = (except?: string): string[] => {
    const args: string[] = []
    for (const locale of LOCALES) {
      if (locale === except) continue
      args.push(`--${locale}`, `val-${locale}`)
    }
    return args
  }

  const OPTION_TOKEN_CASES: ReadonlyArray<[string, string[]]> = [
    ['--key followed by --force', ['--key', '--force', ...sevenValues()]],
    [
      '--key followed by an unknown flag',
      ['--key', '--unknown', ...sevenValues()],
    ],
    [
      '--vi followed by an unsupported locale flag --de',
      ['--key', 'K1', ...sevenValues('vi'), '--vi', '--de'],
    ],
    [
      '--vi followed by an unknown flag',
      ['--key', 'K1', ...sevenValues('vi'), '--vi', '--unknown'],
    ],
  ]

  for (const [name, args] of OPTION_TOKEN_CASES) {
    test(`rejects ${name} and writes no file`, () => {
      const dir = makeFixtureDir()
      const before = snapshot(dir)
      try {
        const run = runScript(args, dir)
        assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
        assertFilesUnchanged(dir, before)
        assertNoTempArtifacts(dir, `rejected run: ${name}`)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

describe('add-missing-keys staging failure cleans temps and keeps originals', () => {
  // Test-only injection ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE makes the
  // staging step of one supported locale fail AFTER its temp file has
  // been created — the "file exists / partially written, then error"
  // shape. The run must exit non-zero, all seven official locale files
  // must keep their original bytes, every temp artifact of this run
  // must be gone, and files the script did not create must survive.
  for (const target of LOCALES) {
    test(`staging failure at ${target} leaves no temp and keeps every other file`, () => {
      const dir = makeFixtureDir()
      const before = snapshot(dir)
      const decoyName = 'not-a-locale.json'
      const decoyContent =
        '{"keep": "this file is not managed by the script"}\n'
      writeFileSync(join(dir, decoyName), decoyContent, 'utf8')
      try {
        const run = runScript(explicitEntryArgs('New key'), dir, {
          ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE: target,
        })
        assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
        assertFilesUnchanged(dir, before)
        assertNoTempArtifacts(dir, `staging failure at ${target}`, [decoyName])
        assert.equal(
          readFileSync(join(dir, decoyName), 'utf8'),
          decoyContent,
          'the cleanup must never touch files this run did not create'
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  test('staging injection with an unsupported locale value is rejected before writes', () => {
    const dir = makeFixtureDir()
    const before = snapshot(dir)
    try {
      const run = runScript(explicitEntryArgs('New key'), dir, {
        ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE: 'de',
      })
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assertFilesUnchanged(dir, before)
      assertNoTempArtifacts(dir, 'unsupported staging injection')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

const DOCS_LOCALES = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

function makeDocsFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'add-missing-keys-docs-'))
  for (const locale of DOCS_LOCALES) {
    writeFileSync(
      join(dir, `${locale}.json`),
      `${JSON.stringify(
        {
          agents: {
            title: `title-${locale}`,
            hub: { title: `hub-${locale}` },
          },
        },
        null,
        2
      )}\n`,
      'utf8'
    )
  }
  return dir
}

function snapshotDocs(dir: string): Map<string, string> {
  const snap = new Map<string, string>()
  for (const locale of DOCS_LOCALES) {
    snap.set(locale, readFileSync(join(dir, `${locale}.json`), 'utf8'))
  }
  return snap
}

function explicitDocsEntryArgs(key: string): string[] {
  const args = ['--docs', '--key', key]
  for (const locale of DOCS_LOCALES) {
    args.push(`--${locale}`, `${key} :: ${locale}`)
  }
  return args
}

describe('add-missing-keys --docs nested locale contract', () => {
  test('writes a dotted key into the nested Docs table and keeps siblings', () => {
    const dir = makeDocsFixtureDir()
    try {
      const run = runScript(explicitDocsEntryArgs('agents.pi.title'), dir)
      assert.equal(run.status, 0, `stderr: ${run.stderr}`)
      for (const locale of DOCS_LOCALES) {
        const json = JSON.parse(
          readFileSync(join(dir, `${locale}.json`), 'utf8')
        ) as {
          agents: {
            title: string
            hub: { title: string }
            pi: { title: string }
          }
        }
        assert.equal(json.agents.title, `title-${locale}`)
        assert.equal(json.agents.hub.title, `hub-${locale}`)
        assert.equal(json.agents.pi.title, `agents.pi.title :: ${locale}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects app locale flags such as --zh and writes no file', () => {
    const dir = makeDocsFixtureDir()
    const before = snapshotDocs(dir)
    try {
      const args = ['--docs', '--key', 'agents.pi.title']
      for (const locale of DOCS_LOCALES.filter((l) => l !== 'zhCN')) {
        args.push(`--${locale}`, `val-${locale}`)
      }
      args.push('--zh', 'should-not-map')
      const run = runScript(args, dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assert.match(run.stderr, /--zh/)
      for (const locale of DOCS_LOCALES) {
        assert.equal(
          readFileSync(join(dir, `${locale}.json`), 'utf8'),
          before.get(locale)
        )
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects a non-dotted docs key before any write', () => {
    const dir = makeDocsFixtureDir()
    const before = snapshotDocs(dir)
    try {
      const run = runScript(explicitDocsEntryArgs('notADottedKey'), dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assert.match(run.stderr, /dotted path/)
      for (const locale of DOCS_LOCALES) {
        assert.equal(
          readFileSync(join(dir, `${locale}.json`), 'utf8'),
          before.get(locale)
        )
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('does not overwrite an existing nested key without --force', () => {
    const dir = makeDocsFixtureDir()
    try {
      const first = runScript(explicitDocsEntryArgs('agents.pi.title'), dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = snapshotDocs(dir)
      const args = ['--docs', '--key', 'agents.pi.title']
      for (const locale of DOCS_LOCALES) {
        args.push(`--${locale}`, `OVERWRITE :: ${locale}`)
      }
      const second = runScript(args, dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.match(second.stdout, /skipped 7/)
      for (const locale of DOCS_LOCALES) {
        assert.equal(
          readFileSync(join(dir, `${locale}.json`), 'utf8'),
          afterFirst.get(locale)
        )
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects setting a leaf under a string parent', () => {
    const dir = makeDocsFixtureDir()
    const before = snapshotDocs(dir)
    try {
      const run = runScript(explicitDocsEntryArgs('agents.title.nested'), dir)
      assert.notEqual(run.status, 0, `stderr: ${run.stderr}`)
      assert.match(run.stderr, /not an object/)
      for (const locale of DOCS_LOCALES) {
        assert.equal(
          readFileSync(join(dir, `${locale}.json`), 'utf8'),
          before.get(locale)
        )
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
