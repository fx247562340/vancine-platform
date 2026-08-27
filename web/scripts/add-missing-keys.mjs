#!/usr/bin/env node
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

/**
 * add-missing-keys.mjs — add explicit translation keys to locale files.
 *
 * This is the ONLY sanctioned way to add i18n keys to the flat locale
 * JSON files in src/i18n/locales/. The script is deterministic,
 * surgical, and FAIL-CLOSED:
 *
 *   - Every entry MUST explicitly provide a value for ALL seven locales
 *     (en, zh, zh-TW, fr, ru, ja, vi). There is NO implicit English
 *     fallback: a missing locale aborts the whole run before any file
 *     is read or written.
 *   - Validation of the complete argument set and of every locale file
 *     happens BEFORE any write. A rejected run leaves all seven files
 *     byte-identical. Both the JSON root and its translation value must
 *     be plain objects in every locale file; a structurally invalid or
 *     missing translation is rejected, never silently replaced.
 *   - Keys that already exist in a locale are never overwritten unless
 *     --force is passed.
 *   - On success each locale file is replaced AT MOST ONCE. The write
 *     path stages every final content in a same-directory temp file,
 *     then renames; each temp path is registered BEFORE its write is
 *     attempted so a mid-write (partial file) failure is still cleaned
 *     up; if any staging or replace step fails, already-replaced files
 *     are restored from the original bytes and this run's temp
 *     artifacts are removed, so all seven files end the run
 *     byte-identical to their pre-run state (on a controlled failure,
 *     restore consistency and clean up this run's temp files — not a
 *     true cross-file transaction or crash guarantee).
 *   - ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE=<locale> and
 *     ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE=<locale> are TEST-ONLY fault
 *     injection points: each names one supported locale whose replace
 *     or staging step fails. They are inert unless set, reject any
 *     value that is not a supported locale (validated before any
 *     write), and never accept a file path.
 *   - Output formatting matches `bun run i18n:sync` (stableStringify:
 *     2-space indent, recursively sorted keys, trailing newline), so a
 *     following `bun run i18n:sync` produces no formatting-only churn.
 *
 * Usage (from web/):
 *
 *   node scripts/add-missing-keys.mjs \
 *     --key 'English source string' \
 *       --en 'English source string' \
 *       --zh '中文翻译' --zh-TW '...' --fr '...' --ru '...' --ja '...' --vi '...' \
 *     [--force]
 *
 *   --key <text>     Declare a key to add. May be repeated.
 *   --<locale> <text>
 *                    Translation for the most recently declared --key.
 *                    ALL seven locale flags are mandatory per key.
 *                    Locales: en, zh, zh-TW, fr, ru, ja, vi.
 *   --force          Overwrite existing keys (default: never overwrite).
 *
 *   Value boundary: the token after --key or any --<locale> flag must
 *   not start with "--" (it would be treated as a missing value and
 *   rejected). Single-hyphen text like "- up to 50%" is a valid value.
 *
 * Exit codes: 0 on success (including "all keys already existed"),
 * 2 on any validation failure — in which case nothing is written.
 *
 * Tests point ADD_MISSING_KEYS_LOCALES_DIR at a fixture directory; the
 * default is the real locale directory resolved from the web/ root.
 */

import fs from 'node:fs'
import path from 'node:path'

const LOCALES_DIR = path.resolve(
  process.env.ADD_MISSING_KEYS_LOCALES_DIR || 'src/i18n/locales'
)
const SUPPORTED_LOCALES = ['en', 'zh', 'zh-TW', 'fr', 'ru', 'ja', 'vi']

function fail(message) {
  process.stderr.write(`add-missing-keys: ${message}\n`)
  process.exit(2)
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  // A value slot (after --key or after a locale flag) must carry a real
  // text token. ANY token starting with "--" is an option token — known
  // or not (--force, --de, --unknown) — and therefore means the value
  // was omitted: fail closed. Plain text that merely starts with a
  // single hyphen ("- up to 50%") stays valid.
  const entries = []
  let current = null
  let force = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--key') {
      const value = argv[++i]
      if (value === undefined) {
        fail('--key requires a non-empty key argument')
      }
      if (value.startsWith('--')) {
        fail(
          `--key is missing its value: ${value} is an option token, not a key`
        )
      }
      if (value.trim() === '') {
        fail('--key requires a non-empty key argument')
      }
      current = { key: value, values: {} }
      entries.push(current)
      continue
    }
    if (arg === '--force') {
      force = true
      continue
    }
    if (arg.startsWith('--')) {
      const locale = arg.slice(2)
      if (!SUPPORTED_LOCALES.includes(locale)) {
        fail(
          `unknown flag ${arg}; supported locales: ${SUPPORTED_LOCALES.join(', ')} (plus --key and --force)`
        )
      }
      if (!current) {
        fail(`${arg} must follow a --key declaration`)
      }
      const value = argv[++i]
      if (value === undefined) {
        fail(`${arg} requires a value argument`)
      }
      if (value.startsWith('--')) {
        fail(
          `${arg} is missing its translation value: ${value} is an option token, not a value`
        )
      }
      if (Object.hasOwn(current.values, locale)) {
        fail(`duplicate --${locale} for key ${JSON.stringify(current.key)}`)
      }
      current.values[locale] = value
      continue
    }
    fail(`unexpected argument: ${arg}`)
  }

  if (entries.length === 0) {
    fail('nothing to do: pass at least one --key')
  }
  return { entries, force }
}

/**
 * Fail-closed validation of the complete entry set. Runs BEFORE any
 * locale file is read or written, so a rejected invocation can never
 * partially modify the locale table.
 */
function validateEntries(entries) {
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      fail(`duplicate key in one invocation: ${JSON.stringify(entry.key)}`)
    }
    seen.add(entry.key)

    const missing = SUPPORTED_LOCALES.filter(
      (locale) => !Object.hasOwn(entry.values, locale)
    )
    if (missing.length > 0) {
      fail(
        `key ${JSON.stringify(entry.key)} is missing explicit values for locale(s): ` +
          `${missing.join(', ')}. Every key must provide all seven locales ` +
          `(${SUPPORTED_LOCALES.join(', ')}); there is no English fallback.`
      )
    }
    for (const locale of SUPPORTED_LOCALES) {
      const value = entry.values[locale]
      if (typeof value !== 'string' || value.trim() === '') {
        fail(
          `key ${JSON.stringify(entry.key)} has an empty value for locale ${locale}; ` +
            'placeholder/empty translations are rejected'
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Locale I/O — identical formatting to sync-i18n.mjs stableStringify
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringifyLocaleCompare(value, indent = 0) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(
      (item) => `${pad}  ${stringifyLocaleCompare(item, indent + 1)}`
    )
    return `[\n${items.join(',\n')}\n${pad}]`
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b))
    if (keys.length === 0) return '{}'
    const lines = keys.map((key, index) => {
      const suffix = index < keys.length - 1 ? ',' : ''
      return `${pad}  ${JSON.stringify(key)}: ${stringifyLocaleCompare(value[key], indent + 1)}${suffix}`
    })
    return `{\n${lines.join('\n')}\n${pad}}`
  }
  return JSON.stringify(value)
}

function readAllLocales() {
  const locales = []
  for (const locale of SUPPORTED_LOCALES) {
    const file = path.join(LOCALES_DIR, `${locale}.json`)
    let bytes
    try {
      bytes = fs.readFileSync(file)
    } catch (error) {
      fail(`cannot read locale ${locale} at ${file}: ${error.message}`)
    }
    let json
    try {
      json = JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      fail(`cannot parse locale ${locale} at ${file}: ${error.message}`)
    }
    // Structure must be validated, never silently repaired: a missing or
    // non-object root/translation is a corrupt locale file, and writing
    // into it would destroy the file the next time it is serialized.
    if (!isPlainObject(json)) {
      fail(`locale ${locale} at ${file}: root is not a plain object`)
    }
    if (!Object.hasOwn(json, 'translation')) {
      fail(`locale ${locale} at ${file}: missing "translation" key`)
    }
    if (!isPlainObject(json.translation)) {
      fail(`locale ${locale} at ${file}: "translation" is not a plain object`)
    }
    // originalBytes is kept verbatim so a failed commit can restore every
    // replaced file to its exact pre-run bytes.
    locales.push({ locale, file, json, originalBytes: bytes })
  }
  return locales
}

// ---------------------------------------------------------------------------
// Test-only failure injection
//
// ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE names ONE supported locale whose
// REPLACE step is forced to fail; ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE
// names ONE supported locale whose STAGING step fails AFTER its temp
// file has been created (the "file exists / partially written, then
// error" shape). They exist purely so the regression tests can prove
// that on a controlled failure the seven official files are restored
// (or never touched) and this run's temp artifacts are cleaned up.
// Both accept a supported locale name only — never a file path — they
// are unset (inert) on every normal execution path, and any other
// value is rejected before a single byte is written.
// ---------------------------------------------------------------------------

function resolveFaultEnv(name) {
  const target = process.env[name]
  if (target === undefined || target === '') return null
  if (!SUPPORTED_LOCALES.includes(target)) {
    fail(`${name} must name one of: ${SUPPORTED_LOCALES.join(', ')}`)
  }
  return target
}

function resolveFaults() {
  return {
    stage: resolveFaultEnv('ADD_MISSING_KEYS_TEST_FAIL_AT_STAGE'),
    replace: resolveFaultEnv('ADD_MISSING_KEYS_TEST_FAIL_AT_LOCALE'),
  }
}

/**
 * Stage-and-commit write with rollback.
 *
 * 1. every final content is computed in memory by the caller;
 * 2. each final content is written to a same-directory temp file; the
 *    temp path is REGISTERED BEFORE the write is attempted, so a
 *    failure mid-write (partial file on disk) is still cleaned up;
 * 3. only after all temp files are on disk, the replace phase renames
 *    each temp file onto its target — at most once per target file;
 * 4. if staging or any replace fails, already-replaced targets are
 *    restored from the saved original bytes and every temp file this
 *    run registered is removed (and only those), so all seven locale
 *    files end the run with their original bytes and the process exits
 *    non-zero.
 *
 * This is "on a controlled failure, restore consistency and clean up
 * this run's temp files" — not a true cross-file filesystem
 * transaction: a process crash between two renames is not covered.
 */
function commitWithRollback(writes, faults) {
  const tmpSuffix = `.add-missing-keys-${process.pid}.tmp`
  const staged = []
  const replaced = []

  const removeTemps = () => {
    for (const s of staged) {
      try {
        if (fs.existsSync(s.tmp)) fs.rmSync(s.tmp)
      } catch {
        /* best effort: the target files are what the contract protects */
      }
    }
  }

  try {
    for (const w of writes) {
      const tmp = `${w.file}${tmpSuffix}`
      // Register before writing: if writeFileSync throws after partially
      // creating the file, cleanup still knows this path.
      staged.push({ ...w, tmp })
      fs.writeFileSync(tmp, w.finalContent, 'utf8')
      if (faults.stage !== null && w.locale === faults.stage) {
        throw new Error(
          `injected test failure after staging locale ${faults.stage}`
        )
      }
    }
    for (const s of staged) {
      if (faults.replace !== null && s.locale === faults.replace) {
        throw new Error(
          `injected test failure before replacing locale ${faults.replace}`
        )
      }
      fs.renameSync(s.tmp, s.file)
      replaced.push(s)
    }
  } catch (error) {
    for (const s of replaced) {
      try {
        fs.writeFileSync(s.file, s.originalBytes)
      } catch (rollbackError) {
        process.stderr.write(
          `add-missing-keys: ROLLBACK FAILED for ${s.locale} at ${s.file}: ${rollbackError.message}\n`
        )
      }
    }
    removeTemps()
    fail(`commit failed; restored replaced files: ${error.message}`)
  }

  // After a full rename pass no temp file should survive; remove any
  // leftover artifact this run created (and only those).
  removeTemps()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { entries, force } = parseArgs(process.argv.slice(2))

  // 1) Validate the complete argument set — before touching any file.
  validateEntries(entries)
  const faults = resolveFaults()

  // 2) Read and parse every locale file — still before any write.
  const locales = readAllLocales()

  // 3) Compute all seven final contents in memory.
  let added = 0
  let skipped = 0
  const writes = []
  for (const { locale, file, json, originalBytes } of locales) {
    const table = json.translation
    let changed = false
    for (const entry of entries) {
      const exists = Object.hasOwn(table, entry.key)
      if (exists && !force) {
        skipped++
        continue
      }
      table[entry.key] = entry.values[locale]
      added++
      changed = true
    }
    if (changed) {
      writes.push({
        locale,
        file,
        originalBytes,
        finalContent: `${stringifyLocaleCompare(json)}\n`,
      })
    }
  }

  // 4) Stage, commit with rollback, and clean up temp artifacts.
  if (writes.length > 0) {
    commitWithRollback(writes, faults)
  }

  process.stdout.write(
    `add-missing-keys: validated ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}; ` +
      `wrote ${added} locale entr${added === 1 ? 'y' : 'ies'}, skipped ${skipped} existing.\n`
  )
}

main()
