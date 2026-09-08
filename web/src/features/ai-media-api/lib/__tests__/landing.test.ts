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
import { spawn } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  AI_MEDIA_API_BASE_URL,
  AI_MEDIA_API_EXAMPLES,
  AI_MEDIA_API_KEY_ENV_VAR,
  AI_MEDIA_BENEFITS,
  AI_MEDIA_CANONICAL,
  AI_MEDIA_CAPABILITIES,
  AI_MEDIA_CATEGORIES,
  AI_MEDIA_CTA_EVENT,
  AI_MEDIA_FAQ,
  AI_MEDIA_I18N_KEYS,
  AI_MEDIA_RESOURCE_EVENT,
  AI_MEDIA_USE_CASES,
  buildAiMediaApiExample,
  getAiMediaCtaDestination,
  getAiMediaCtaTarget,
  getAiMediaPageMetadata,
  shellSingleQuote,
} from '../landing'

// ---------------------------------------------------------------------------
// Shell-escape unit tests
// ---------------------------------------------------------------------------

describe('shellSingleQuote', () => {
  it('returns the same string when the input has no quotes', () => {
    expect(shellSingleQuote('plain-model-name')).toBe("'plain-model-name'")
  })

  it('escapes an embedded single quote with the POSIX-safe idiom', () => {
    // The POSIX safe-quoting rule: a single quote inside a single-quoted
    // string is escaped by closing, emitting an escaped single quote,
    // and reopening the quote. The output is the byte sequence
    // `'<name>'<close><escaped-quote><reopen><with>...<close>`.
    const expected = "'" + 'name' + "'\\''" + 'with' + "'\\''" + 'quotes' + "'"
    expect(shellSingleQuote("name'with'quotes")).toBe(expected)
  })

  it('leaves double quotes, dollar signs, and backticks alone', () => {
    // Inside POSIX single quotes, none of these characters are special
    // — the round-trip is byte-identical. The catalogue never needs to
    // escape them explicitly.
    const hostile = `name"$\`with\`symbols`
    expect(shellSingleQuote(hostile)).toBe(`'${hostile}'`)
  })

  it('embeds newlines verbatim (POSIX single quotes span newlines)', () => {
    expect(shellSingleQuote('a\nb')).toBe("'a\nb'")
  })
})

// ---------------------------------------------------------------------------
// Build + execute the rendered curl in a real shell
// ---------------------------------------------------------------------------

/**
 * Spawn the rendered snippet in a fresh non-interactive bash subshell and
 * observe (a) the exit code, (b) the value of `BODY` (the JSON the shell
 * actually passed to the curl call), and (c) the value of `URL`. We never
 * need the curl request to hit a real network: the test preloads a
 * `curl` stub function via `env` that just echoes its `-d` argument.
 * This proves the snippet is a safe, executable shell command.
 */
function executeSnippet(
  snippet: string
): Promise<{ exitCode: number; stdout: string }> {
  // A self-contained bash script: a fake `curl` that captures URL and
  // -d BODY, then echoes `URL\tBASE64(BODY)\n`, so multi-line JSON
  // bodies do not break the test-side split. We pipe through `base64`
  // only if it is on PATH; otherwise we fall back to a hex dump that
  // the test decoder can reverse.
  const harness = `
fake_curl() {
  local url=""
  local body=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -X) shift; ;;
      -H) shift; ;;
      -d) body="$2"; shift 2; ;;
      http*) url="$1"; shift; ;;
      *) shift; ;;
    esac
  done
  if command -v base64 >/dev/null 2>&1; then
    printf '%s\\n%s\\n' "$url" "$(printf '%s' "$body" | base64 | tr -d '\\n')"
  else
    printf '%s\\n%s\\n' "$url" "$(printf '%s' "$body" | od -An -vtx1 | tr -d ' \\n')"
  fi
}
curl() { fake_curl "$@"; }
export -f curl fake_curl
set -e
${snippet
  .replaceAll('$VANCINE_API_KEY', 'DUMMY_KEY')
  .replaceAll('$TASK_ID', 'DUMMY_TASK')}
`
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', harness], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', reject)
    proc.on('close', (exitCode) => {
      if (exitCode !== 0 && stderr) {
        // eslint-disable-next-line no-console
        console.error('bash stderr:', stderr)
      }
      resolve({ exitCode: exitCode ?? -1, stdout })
    })
  })
}

/**
 * Decode the fake-curl harness payload. The harness emits two lines:
 * the URL, then the base64-encoded body. The decoder reverses the
 * encoding so tests can JSON.parse the body deterministically.
 */
function decodeStdout(stdout: string): { url: string; body: string } {
  const lines = stdout.split('\n')
  // The first line is the URL; the second is the encoded body. Strip
  // any trailing empty line.
  const url = lines[0] ?? ''
  const encoded = lines[1] ?? ''
  // base64 decode via Buffer (jsdom + node:buffer)
  const buf = Buffer.from(encoded, 'base64')
  return { url, body: buf.toString('utf8') }
}

const exampleById = new Map(
  AI_MEDIA_API_EXAMPLES.map((example) => [example.id, example])
)

// ---------------------------------------------------------------------------
// CTA destination
// ---------------------------------------------------------------------------

describe('CTA destination resolution', () => {
  it('guests land on /sign-up, authenticated users on /playground', () => {
    expect(getAiMediaCtaDestination(false)).toBe('/sign-up')
    expect(getAiMediaCtaDestination(true)).toBe('/playground')
  })

  it('retains exactly the five UTM attribution parameters', () => {
    const search =
      '?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=a&utm_term=b'
    const destination = getAiMediaCtaDestination(false, search)
    const params = new URLSearchParams(destination.split('?')[1])
    expect([...params.keys()].sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
      'utm_term',
    ])
  })

  it('drops sensitive, routing, and unknown parameters', () => {
    const search =
      '?email=a@b.com&phone=123&username=u&user_id=7&token=t&api_key=k' +
      '&key=k&password=p&redirect=/evil&return_to=/evil&unknown=1&utm_source=ok'
    expect(getAiMediaCtaDestination(true, search)).toBe(
      '/playground?utm_source=ok'
    )
  })

  it('never produces an absolute or foreign target (no open redirect)', () => {
    for (const auth of [false, true]) {
      const destination = getAiMediaCtaDestination(
        auth,
        '?redirect=https://evil.example.com&return_to=//evil.example.com'
      )
      expect(destination === '/sign-up' || destination === '/playground').toBe(
        true
      )
    }
  })

  it('splits into a TanStack Link target with the same allowlist', () => {
    expect(getAiMediaCtaTarget(false, '?utm_source=x&email=a@b.com')).toEqual({
      to: '/sign-up',
      search: { utm_source: 'x' },
    })
    expect(getAiMediaCtaTarget(true, '?email=a@b.com')).toEqual({
      to: '/playground',
      search: {},
    })
  })
})

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

describe('page metadata', () => {
  const supportedLanguages = ['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi']

  it('pins canonical and og:url for every language', () => {
    expect(AI_MEDIA_CANONICAL).toBe('https://vancine.com/ai-media-api')
    for (const language of supportedLanguages) {
      const metadata = getAiMediaPageMetadata(language)
      expect(metadata.canonical).toBe(AI_MEDIA_CANONICAL)
      expect(metadata.ogUrl).toBe(metadata.canonical)
      expect(metadata.title.length).toBeGreaterThan(0)
      expect(metadata.description.length).toBeGreaterThan(0)
      expect(metadata.ogTitle.length).toBeGreaterThan(0)
      expect(metadata.ogDescription.length).toBeGreaterThan(0)
      expect(
        metadata.twitterTitle !== undefined && metadata.twitterTitle.length > 0
      ).toBe(true)
      expect(
        metadata.twitterDescription !== undefined &&
          metadata.twitterDescription.length > 0
      ).toBe(true)
    }
  })

  it('English Twitter pair is byte-identical to router/web_metadata.go', () => {
    const metadata = getAiMediaPageMetadata('en')
    expect(metadata.twitterTitle).toBe('AI Media API: Image & Video')
    expect(metadata.twitterDescription).toBe(
      'Access Chinese AI media models through one API. Image and video generation with one API key and unified billing.'
    )
  })

  it('covers all seven supported languages distinctly', () => {
    const titles = supportedLanguages.map(
      (language) => getAiMediaPageMetadata(language).title
    )
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('normalizes BCP-47 variants and falls back to English', () => {
    expect(getAiMediaPageMetadata('zh-CN').title).toBe(
      getAiMediaPageMetadata('zhCN').title
    )
    expect(getAiMediaPageMetadata('zh-Hant').title).toBe(
      getAiMediaPageMetadata('zhTW').title
    )
    expect(getAiMediaPageMetadata('de-DE').title).toBe(
      getAiMediaPageMetadata('en').title
    )
  })
})

// ---------------------------------------------------------------------------
// API example contract
// ---------------------------------------------------------------------------

describe('API example contract', () => {
  it('provides image and video examples', () => {
    expect(AI_MEDIA_API_EXAMPLES.map((example) => example.id)).toEqual([
      'image',
      'video',
    ])
  })

  it('endpoints and methods match the documented media routes', () => {
    expect(AI_MEDIA_API_BASE_URL).toBe('https://vancine.com/v1')
    const image = exampleById.get('image')
    const video = exampleById.get('video')
    expect(image).toBeDefined()
    expect(video).toBeDefined()
    if (!image || !video) return
    expect(image.method).toBe('POST')
    expect(image.endpointPath).toBe('/images/generations')
    expect(video.method).toBe('POST')
    expect(video.endpointPath).toBe('/video/generations')
    expect(video.poll?.method).toBe('GET')
    expect(video.poll?.pathTemplate).toBe('/video/generations/{{taskId}}')
    const imageCode = buildAiMediaApiExample(image, 'm')
    expect(imageCode).toContain(
      'POST https://vancine.com/v1/images/generations'
    )
    expect(imageCode).not.toContain('vancine.com/v1/v1/')
  })

  it('body keys are stable, vendor-neutral, and free of model-specific call fields', () => {
    const image = exampleById.get('image')
    const video = exampleById.get('video')
    expect(image).toBeDefined()
    expect(video).toBeDefined()
    if (!image || !video) return
    expect([...image.bodyKeys]).toEqual(['model', 'prompt', 'n', 'size'])
    expect([...video.bodyKeys]).toEqual(['model', 'prompt'])
    for (const key of video.bodyKeys) {
      expect(
        ['size', 'resolution', 'duration', 'ratio', 'seed'].includes(key)
      ).toBe(false)
    }
  })

  it('rendered curl text uses the live model name and only the documented fields', () => {
    const image = exampleById.get('image')
    const video = exampleById.get('video')
    expect(image).toBeDefined()
    expect(video).toBeDefined()
    if (!image || !video) return
    const imageCode = buildAiMediaApiExample(image, 'live-image-2027')
    expect(imageCode).toContain(
      'POST https://vancine.com/v1/images/generations'
    )
    expect(imageCode).toContain('"model": "live-image-2027"')
    expect(imageCode).toContain('"prompt"')
    expect(imageCode).toContain('"n"')
    expect(imageCode).toContain('"size"')
    expect(imageCode).not.toContain('qwen-image-2.0')
    expect(imageCode).not.toContain('Doubao-Seedance-2.5')
    expect(imageCode).not.toContain('Doubao-Seedance-1.5-pro')

    const videoCode = buildAiMediaApiExample(video, 'live-video-2027')
    expect(videoCode).toContain('POST https://vancine.com/v1/video/generations')
    expect(videoCode).toContain('"model": "live-video-2027"')
    expect(videoCode).toContain('"prompt"')
    for (const forbidden of ['size', 'resolution', 'duration', 'ratio']) {
      expect(new RegExp(`["']?${forbidden}["']?\\s*:`).test(videoCode)).toBe(
        false
      )
    }
    expect(videoCode).toContain(
      'GET https://vancine.com/v1/video/generations/$TASK_ID'
    )
  })

  it('rendered curl text always reads the key from the environment variable', () => {
    for (const example of AI_MEDIA_API_EXAMPLES) {
      const code = buildAiMediaApiExample(example, 'live-model')
      expect(code).toContain(AI_MEDIA_API_KEY_ENV_VAR)
    }
  })

  it('rendered curl text never contains legacy domains, hardcoded secrets, or fixed prices', () => {
    for (const example of AI_MEDIA_API_EXAMPLES) {
      const code = buildAiMediaApiExample(example, 'live-model')
      expect(code).not.toContain('api.vancine.com')
      expect(code).not.toContain('localhost')
      expect(code).not.toContain('127.0.0.1')
      expect(code).not.toContain('sk-')
      expect(/\$\d/.test(code)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Shell-safety proof: render a hostile model name and execute the snippet
// in a real bash subshell. The body the shell actually sees must round-
// trip to the original string.
// ---------------------------------------------------------------------------

describe('rendered curl is safe shell text for hostile model names', () => {
  const image = exampleById.get('image')
  const video = exampleById.get('video')
  if (!image || !video) {
    throw new Error('test setup: image and video examples must exist')
  }

  it('a single-quote in the model name is escaped to a valid POSIX idiom', async () => {
    const snippet = buildAiMediaApiExample(image, "name'with'quotes")
    // The model name has 18 chars; the round-trip shell parser must
    // see those 18 chars as the value of the `model` field.
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe("name'with'quotes")
  })

  it('a double-quote in the model name is round-tripped by the shell', async () => {
    const snippet = buildAiMediaApiExample(image, 'name"with"quotes')
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe('name"with"quotes')
  })

  it('a dollar sign in the model name is round-tripped by the shell', async () => {
    const snippet = buildAiMediaApiExample(image, 'price$TAG')
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe('price$TAG')
  })

  it('a backtick in the model name is round-tripped by the shell', async () => {
    const snippet = buildAiMediaApiExample(image, 'model`whoami`')
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe('model`whoami`')
  })

  it('a newline in the model name is round-tripped by the shell', async () => {
    const snippet = buildAiMediaApiExample(image, 'line1\nline2')
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe('line1\nline2')
  })

  it('hostile model name in the video example still works end-to-end', async () => {
    const snippet = buildAiMediaApiExample(video, "video'model")
    const { exitCode, stdout } = await executeSnippet(snippet)
    expect(exitCode).toBe(0)
    // The harness emits `url\nbase64(body)` for every curl call; we
    // read the first body and confirm it round-trips.
    const { body } = decodeStdout(stdout)
    const parsed = JSON.parse(body) as { model: string }
    expect(parsed.model).toBe("video'model")
  })
})

// ---------------------------------------------------------------------------
// Page content contract
// ---------------------------------------------------------------------------

describe('page content contract', () => {
  it('uses the shared anonymous event names', () => {
    expect(AI_MEDIA_CTA_EVENT).toBe('get_started_clicked')
    expect(AI_MEDIA_RESOURCE_EVENT).toBe('developer_resource_clicked')
  })

  it('sections register i18n keys through the shared registry', () => {
    const registry = new Set<string>(AI_MEDIA_I18N_KEYS)
    const referenced = [
      ...AI_MEDIA_CAPABILITIES,
      ...AI_MEDIA_BENEFITS,
      ...AI_MEDIA_USE_CASES,
      ...AI_MEDIA_CATEGORIES,
    ]
    for (const entry of referenced) {
      expect(registry.has(entry.titleKey)).toBe(true)
      expect(registry.has(entry.descriptionKey)).toBe(true)
    }
    for (const entry of AI_MEDIA_FAQ) {
      expect(registry.has(entry.questionKey)).toBe(true)
      expect(registry.has(entry.answerKey)).toBe(true)
    }
  })

  it('categories cover the two documented media Docs pages', () => {
    expect(
      AI_MEDIA_CATEGORIES.map((category) => category.docsSlug).sort()
    ).toEqual(['image', 'video'])
  })

  it('copy contains none of the retired claims', () => {
    const copySources = [
      ...AI_MEDIA_I18N_KEYS,
      ...AI_MEDIA_API_EXAMPLES.flatMap((example) =>
        AI_MEDIA_API_EXAMPLES.map(() =>
          buildAiMediaApiExample(example, 'placeholder-model')
        )
      ),
    ]
    const joined = copySources.join('\n')
    expect(joined).not.toContain('$1')
    expect(/free credit/i.test(joined)).toBe(false)
    expect(/no credit card/i.test(joined)).toBe(false)
    expect(/credit card required/i.test(joined)).toBe(false)
    expect(/leading|state of the art|latest/i.test(joined)).toBe(false)
    expect(joined).not.toContain('api.vancine.com')
    expect(joined).not.toContain('qwen-image-2.0')
    expect(joined).not.toContain('Doubao-Seedance-2.5')
  })
})
