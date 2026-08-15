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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocsCodeBlock } from '../components/code-block'
import { initTestI18n, setDocsBundle, EN_DOCS } from './test-i18n'

function stubClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl)
  Object.defineProperty(global.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

function removeClipboard() {
  Object.defineProperty(global.navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  })
}

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DocsCodeBlock copy paths', () => {
  it('titled block copies via the production helper (success)', async () => {
    const writeText = stubClipboard(async () => undefined)
    render(<DocsCodeBlock code='curl https://vancine.com/v1' title='cURL' />)

    const button = screen.getByRole('button', { name: 'Copy' })
    await userEvent.click(button)

    expect(writeText).toHaveBeenCalledWith('curl https://vancine.com/v1')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '✓ Copied' })
      ).toBeInTheDocument()
    )
  })

  it('untitled block copies via the production helper (success)', async () => {
    const writeText = stubClipboard(async () => undefined)
    render(<DocsCodeBlock code='print("hi")' language='python' />)

    const button = screen.getByRole('button', { name: 'Copy' })
    await userEvent.click(button)

    expect(writeText).toHaveBeenCalledWith('print("hi")')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '✓ Copied' })
      ).toBeInTheDocument()
    )
  })

  it('clipboard rejection does not crash and does not show success', async () => {
    stubClipboard(async () => {
      throw new Error('clipboard blocked')
    })
    render(<DocsCodeBlock code='secret' title='t' />)

    const button = screen.getByRole('button', { name: 'Copy' })
    await userEvent.click(button)

    // Still labelled Copy (no false success), and no throw.
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '✓ Copied' })).toBeNull()
  })

  it('missing clipboard API is handled gracefully', async () => {
    removeClipboard()
    render(<DocsCodeBlock code='x' title='t' />)
    const button = screen.getByRole('button', { name: 'Copy' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })
})

describe('DocsCodeBlock horizontal scroll (mobile)', () => {
  const LONG_CODE = `curl -X POST https://vancine.com/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer sk-your-api-key" -d '{"model":"glm-5.1","messages":[{"role":"user","content":"a very very very long line that must scroll horizontally on narrow mobile viewports"}]}'`

  it('renders long code in a horizontally scrollable container (not clipped)', async () => {
    render(<DocsCodeBlock code={LONG_CODE} />)

    // rc23 renders CodeMirror (role=textbox, accessible name = language);
    // the legacy <pre> no longer exists. The scroll carrier is
    // .code-block-scroll, which grants horizontal scrolling so the long line
    // is reachable instead of being clipped by the rounded outer container.
    const editor = await screen.findByRole('textbox', { name: 'bash' })
    const scrollCarrier = editor.closest('.code-block-scroll')
    expect(scrollCarrier).not.toBeNull()
    expect(scrollCarrier?.className).toMatch(/overflow-auto/)
  })
})
