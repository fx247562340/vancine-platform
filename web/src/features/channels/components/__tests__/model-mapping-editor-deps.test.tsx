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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelMappingEditor } from '../model-mapping-editor'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const FIRST_MAPPING = '{\n  "gpt-3.5-turbo": "gpt-3.5-turbo-0125"\n}'
const SECOND_MAPPING = '{\n  "claude-3": "claude-3-5"\n}'

function renderEditor(value: string) {
  const onChange = vi.fn()
  const view = render(
    <I18nextProvider i18n={i18n}>
      <ModelMappingEditor value={value} onChange={onChange} />
    </I18nextProvider>
  )
  return { onChange, view }
}

function fromInput() {
  return screen.getByPlaceholderText('gpt-3.5-turbo') as HTMLInputElement
}

function toInput() {
  return screen.getByPlaceholderText('gpt-3.5-turbo-0125') as HTMLInputElement
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ModelMappingEditor external value sync', () => {
  it('displays the initial external value as mapping rows', () => {
    renderEditor(FIRST_MAPPING)

    expect(fromInput()).toHaveValue('gpt-3.5-turbo')
    expect(toInput()).toHaveValue('gpt-3.5-turbo-0125')
  })

  it('replaces the old mapping rows when a new external value arrives', () => {
    const { view } = renderEditor(FIRST_MAPPING)

    expect(fromInput()).toHaveValue('gpt-3.5-turbo')

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ModelMappingEditor value={SECOND_MAPPING} onChange={vi.fn()} />
      </I18nextProvider>
    )

    // The old mapping is gone and the new one is shown in its place.
    expect(screen.getAllByPlaceholderText('gpt-3.5-turbo')).toHaveLength(1)
    expect(fromInput()).toHaveValue('claude-3')
    expect(toInput()).toHaveValue('claude-3-5')
  })

  it('never reports an external value sync through onChange', () => {
    const { onChange, view } = renderEditor(FIRST_MAPPING)

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ModelMappingEditor value={SECOND_MAPPING} onChange={onChange} />
      </I18nextProvider>
    )

    expect(fromInput()).toHaveValue('claude-3')
    // External sync only mirrors the value; the caller is not notified.
    expect(onChange).not.toHaveBeenCalled()
  })
})
