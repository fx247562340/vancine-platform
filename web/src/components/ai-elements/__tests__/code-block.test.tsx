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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import { CodeBlock, CodeBlockEditor } from '../code-block'

// CodeBlock's toolbar labels come from the GLOBAL namespace; initialize a
// minimal global instance once (the shared component never uses the Docs
// namespace).
let i18nReady = false
async function initGlobalI18n(): Promise<void> {
  if (!i18nReady) {
    await i18next.use(initReactI18next).init({
      resources: { en: { translation: enLocale.translation } },
      lng: 'en',
      fallbackLng: 'en',
      nsSeparator: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    i18nReady = true
  }
  await i18next.changeLanguage('en')
}

/** The CodeMirror host carries the computed min-height as a CSS variable. */
function editorMinHeight(container: HTMLElement): string {
  const host = container.querySelector<HTMLElement>('[role="textbox"]')
  expect(host).not.toBeNull()
  return (host as HTMLElement).style.getPropertyValue(
    '--code-editor-min-height'
  )
}

beforeEach(async () => {
  await initGlobalI18n()
})

describe('read-only CodeBlock height adapts to its content', () => {
  it('a single-line block is exactly one line tall (about 3.5rem)', () => {
    const { container } = render(
      <CodeBlock code='https://vancine.com/v1' language='bash' />
    )
    // 1 line * 1.5rem line-height + 2rem vertical padding = 3.5rem; never
    // the former four-line minimum with its block of empty space.
    expect(editorMinHeight(container)).toBe('3.5rem')
  })

  it('a six-line block sizes to six lines', () => {
    const sixLines = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join(
      '\n'
    )
    const { container } = render(<CodeBlock code={sixLines} language='bash' />)
    // 6 * 1.5 + 2 = 11rem
    expect(editorMinHeight(container)).toBe('11rem')
  })
})

describe('read-only CodeBlock collapse semantics', () => {
  it('collapses long code to the 12-line preview and expands back', async () => {
    const twentyLines = Array.from(
      { length: 20 },
      (_, i) => `line ${i + 1}`
    ).join('\n')
    const { container } = render(
      <CodeBlock
        code={twentyLines}
        defaultCollapsed
        language='bash'
        showToolbar
      />
    )

    const carrier = container.querySelector<HTMLElement>('.code-block-scroll')
    expect(carrier).not.toBeNull()
    // Collapsed preview: 12 * 1.5 + 2 = 20rem max-height.
    expect((carrier as HTMLElement).style.maxHeight).toBe('20rem')

    const expand = screen.getByRole('button', { name: 'Expand' })
    await userEvent.click(expand)
    // Expanded without maxExpandedLines: no max-height cap.
    expect((carrier as HTMLElement).style.maxHeight).toBe('')
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
  })
})

describe('editable CodeBlockEditor height floor', () => {
  it('keeps the four-line minimum for short content', () => {
    const { container } = render(
      <CodeBlockEditor
        ariaLabel='editable sample'
        language='bash'
        onChange={() => undefined}
        rows={2}
        value='x'
      />
    )
    // Math.max(4, rows=2) * 1.5 + 2 = 8rem: the read-only one-line change
    // must not shrink the editor.
    expect(editorMinHeight(container)).toBe('8rem')
  })
})
