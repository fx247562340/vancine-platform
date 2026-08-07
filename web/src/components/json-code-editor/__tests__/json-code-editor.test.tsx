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
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { JsonCodeEditor } from '../../json-code-editor'

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        JSON: 'JSON',
        'Invalid JSON': 'Invalid JSON',
        'Copied to clipboard': 'Copied to clipboard',
        'Failed to copy': 'Failed to copy',
        'Format JSON': 'Format JSON',
      },
    },
  },
})

function renderEditor(
  props: React.ComponentProps<typeof JsonCodeEditor>,
  user = userEvent.setup()
) {
  const view = render(
    <I18nextProvider i18n={i18n}>
      <JsonCodeEditor {...props} />
    </I18nextProvider>
  )
  return { ...view, user }
}

describe('JsonCodeEditor component', () => {
  it('forwards form attributes and lifecycle callbacks to the textarea', async () => {
    const blurCalls: number[] = []
    const refValues: Array<HTMLTextAreaElement | null> = []
    const { container, unmount } = renderEditor({
      value: '{"model":"gpt"}',
      onChange: () => undefined,
      id: 'json-input',
      name: 'model_config',
      placeholder: '{"model":"gpt"}',
      disabled: true,
      'aria-describedby': 'model-help',
      'aria-invalid': true,
      'data-form-root': 'settings-form',
      onBlur: () => blurCalls.push(1),
      textareaRef: (element) => refValues.push(element),
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.id).toBe('json-input')
    expect(textarea.name).toBe('model_config')
    expect(textarea.placeholder).toBe('{"model":"gpt"}')
    expect(textarea.disabled).toBe(true)
    expect(textarea.getAttribute('aria-describedby')).toBe('model-help')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.getAttribute('data-form-root')).toBe('settings-form')

    fireEvent.blur(textarea)
    expect(blurCalls).toEqual([1])
    expect(refValues[0]).toBe(textarea)

    unmount()
    expect(refValues.at(-1)).toBeNull()
  })

  it('emits user edits and synchronizes a controlled value', async () => {
    const changes: string[] = []
    const { container, rerender } = renderEditor({
      value: '{"count":1}',
      onChange: (value) => changes.push(value),
    })
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()

    // Set the value through the prototype setter so React's controlled-input
    // tracker registers the change, then dispatch input to fire onChange.
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )?.set
    expect(valueSetter).toBeDefined()
    if (valueSetter) valueSetter.call(textarea, '{"count":2}')
    fireEvent.input(textarea)
    expect(changes).toContain('{"count":2}')

    rerender(
      <I18nextProvider i18n={i18n}>
        <JsonCodeEditor
          value='{"count":3}'
          onChange={(value) => changes.push(value)}
        />
      </I18nextProvider>
    )
    expect(textarea.value).toBe('{"count":3}')
  })

  it('formats valid JSON through the public toolbar action', async () => {
    const changes: string[] = []
    const { user } = renderEditor({
      value: '{"model":{"ratio":2}}',
      onChange: (value) => changes.push(value),
    })

    await user.click(screen.getByRole('button', { name: 'Format JSON' }))
    expect(changes).toContain('{\n  "model": {\n    "ratio": 2\n  }\n}')
  })
})
