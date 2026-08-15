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
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { act } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ParamOverrideEditorDialog } from '../param-override-editor-dialog'

// jsdom lacks the Web Animations API; Base UI's ScrollArea viewport calls
// getAnimations during its mount-time scroll checks. Stub it locally so the
// dialog renders without touching the shared test setup (same pattern as the
// user-binding-dialog tests). The original descriptor is captured once and
// restored after every test so the prototype returns to its pre-test state.
const originalGetAnimationsDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'getAnimations'
)

function installGetAnimationsMock(): void {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  })
}

function restoreGetAnimations(): void {
  if (originalGetAnimationsDescriptor) {
    Object.defineProperty(
      Element.prototype,
      'getAnimations',
      originalGetAnimationsDescriptor
    )
  } else {
    delete (Element.prototype as unknown as Record<string, unknown>)
      .getAnimations
  }
}

beforeEach(() => {
  installGetAnimationsMock()
})

const i18n = i18next.createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

afterEach(() => {
  try {
    cleanup()
  } finally {
    restoreGetAnimations()
  }
})

const OPERATIONS_VALUE = JSON.stringify({
  operations: [
    {
      description: 'set temperature',
      path: 'temperature',
      mode: 'set',
      value: 0.7,
    },
  ],
})

const LEGACY_VALUE = JSON.stringify({ temperature: 0.7, max_tokens: 1000 })

const RETURN_ERROR_VALUE = JSON.stringify({
  operations: [
    {
      mode: 'return_error',
      value: { message: 'denied', status_code: 403 },
    },
  ],
})

const PRUNE_VALUE = JSON.stringify({
  operations: [
    {
      mode: 'prune_objects',
      value: { rules: [{ path: 'usage', mode: 'full', value: 'x' }] },
    },
  ],
})

const SET_VALUE = JSON.stringify({
  operations: [{ mode: 'set', path: 'temperature', value: 0.7 }],
})

const DELETE_VALUE = JSON.stringify({
  operations: [{ mode: 'delete', path: 'x-remove' }],
})

const SYNC_VALUE = JSON.stringify({
  operations: [{ mode: 'sync_fields', from: 'json:source', to: 'json:target' }],
})

const SYNC_EMPTY_VALUE = JSON.stringify({
  operations: [{ mode: 'sync_fields', from: '', to: '' }],
})

const REPLACE_VALUE = JSON.stringify({
  operations: [{ mode: 'replace', path: 'model', from: 'openai/', to: 'v1/' }],
})

async function renderDialog(value: string): Promise<void> {
  render(
    <I18nextProvider i18n={i18n}>
      <ParamOverrideEditorDialog
        open
        value={value}
        onOpenChange={() => undefined}
        onSave={() => undefined}
      />
    </I18nextProvider>
  )
  // Flush Base UI ScrollArea's mount-time microtask state updates inside act.
  await act(async () => {})
}

describe('ParamOverrideEditorDialog editor modes', () => {
  it('shows the operations visual editor for an operations-array value', async () => {
    await renderDialog(OPERATIONS_VALUE)

    expect(screen.getByText('Rules')).toBeTruthy()
    expect(screen.queryByText('Legacy Format (JSON Object)')).toBeNull()
  })

  it('shows the legacy JSON object editor for a plain object value', async () => {
    await renderDialog(LEGACY_VALUE)

    expect(screen.getByText('Legacy Format (JSON Object)')).toBeTruthy()
    expect(screen.queryByText('Rules')).toBeNull()
  })

  it('switches to JSON text and back to the operations visual editor', async () => {
    const user = userEvent.setup()
    await renderDialog(OPERATIONS_VALUE)

    await user.click(screen.getByRole('button', { name: 'JSON Text' }))
    expect(screen.getByText('Advanced text editing')).toBeTruthy()
    expect(screen.queryByText('Legacy Format (JSON Object)')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Visual' }))
    expect(screen.getByText('Rules')).toBeTruthy()
    expect(screen.queryByText('Legacy Format (JSON Object)')).toBeNull()
  })
})

describe('ParamOverrideEditorDialog value section', () => {
  it('shows the return error editor and hides the generic value input for return_error', async () => {
    await renderDialog(RETURN_ERROR_VALUE)

    expect(screen.getByText('Custom Error Response')).toBeTruthy()
    expect(screen.queryByText('Value (supports JSON or plain text)')).toBeNull()
    expect(screen.queryByText('Object Prune Rules')).toBeNull()
  })

  it('shows the prune editor and hides the generic value input for prune_objects', async () => {
    await renderDialog(PRUNE_VALUE)

    expect(screen.getByText('Object Prune Rules')).toBeTruthy()
    expect(screen.queryByText('Value (supports JSON or plain text)')).toBeNull()
    expect(screen.queryByText('Custom Error Response')).toBeNull()
  })

  it('shows the generic value input for a plain value-capable mode', async () => {
    await renderDialog(SET_VALUE)

    expect(screen.getByText('Value (supports JSON or plain text)')).toBeTruthy()
    expect(screen.queryByText('Custom Error Response')).toBeNull()
    expect(screen.queryByText('Object Prune Rules')).toBeNull()
  })

  it('renders no value editors for a mode without value capability', async () => {
    await renderDialog(DELETE_VALUE)

    expect(screen.queryByText('Value (supports JSON or plain text)')).toBeNull()
    expect(screen.queryByText('Custom Error Response')).toBeNull()
    expect(screen.queryByText('Object Prune Rules')).toBeNull()
  })
})

describe('ParamOverrideEditorDialog sync/from/to section', () => {
  it('shows the sync editor with source and target endpoints for sync_fields', async () => {
    await renderDialog(SYNC_VALUE)

    expect(screen.getByText('Sync Endpoints')).toBeTruthy()
    expect(screen.getByText('Source Endpoint')).toBeTruthy()
    expect(screen.getByText('Target Endpoint')).toBeTruthy()
    expect(screen.queryByText('Match Text')).toBeNull()
    expect(screen.queryByText('Replace With')).toBeNull()
  })

  it('keeps the sync editor for empty target specs per the current parse behavior', async () => {
    await renderDialog(SYNC_EMPTY_VALUE)

    expect(screen.getByText('Sync Endpoints')).toBeTruthy()
    expect(screen.queryByText('Match Text')).toBeNull()
  })

  it('shows Match Text and Replace With inputs for replace (meta.to is defined as false)', async () => {
    await renderDialog(REPLACE_VALUE)

    expect(screen.getByText('Match Text')).toBeTruthy()
    expect(screen.getByText('Replace With')).toBeTruthy()
  })

  it('renders no from/to inputs for a mode without from/to capability', async () => {
    await renderDialog(SET_VALUE)

    expect(screen.queryByText('Match Text')).toBeNull()
    expect(screen.queryByText('Replace With')).toBeNull()
    expect(screen.queryByText('Source Field')).toBeNull()
    expect(screen.queryByText('Target Field')).toBeNull()
  })
})
