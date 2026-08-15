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
import { cleanup, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { WebPreview, WebPreviewBody } from '../web-preview'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const FIXED_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-presentation'

function renderBody(props: Record<string, unknown> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <WebPreview>
        <WebPreviewBody src='https://example.com/page' {...props} />
      </WebPreview>
    </I18nextProvider>
  )
}

function frame() {
  return screen.getByTitle('Preview') as HTMLIFrameElement
}

afterEach(() => {
  cleanup()
})

describe('WebPreviewBody sandbox policy', () => {
  it('keeps scripts but never grants same-origin access', () => {
    renderBody()

    const sandbox = frame().getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox.split(' ').sort()).toEqual(FIXED_SANDBOX.split(' ').sort())
    expect(frame()).toHaveAttribute('src', 'https://example.com/page')
  })

  it('cannot be widened through the sandbox prop', () => {
    renderBody({
      sandbox:
        'allow-scripts allow-same-origin allow-top-navigation allow-downloads',
    })

    const sandbox = frame().getAttribute('sandbox') ?? ''
    expect(sandbox.split(' ').sort()).toEqual(FIXED_SANDBOX.split(' ').sort())
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(frame()).toHaveAttribute('src', 'https://example.com/page')
  })
})
