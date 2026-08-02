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
// Vitest + jsdom. The voice selector must only appear for audio speech
// models, and the selected voice label must follow the model version
// (mars voices for 1.0, uranus voices for 2.0).
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOUBAO_TTS_VOICES, DOUBAO_TTS2_VOICES } from '../constants'
import { VoiceSelect } from './voice-select'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// jsdom does not implement matchMedia (needed by the Select popup hook)
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('VoiceSelect model gating', () => {
  it('renders nothing for non-audio models', () => {
    const { container } = render(
      <VoiceSelect
        model='gpt-4o'
        onChange={() => {}}
        value='zh_female_vv_uranus_bigtts'
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the selector for audio speech models', () => {
    render(
      <VoiceSelect
        model='doubao-tts2.0'
        onChange={() => {}}
        value='zh_female_vv_uranus_bigtts'
      />
    )
    expect(screen.getByText('Voice')).toBeInTheDocument()
  })
})

describe('VoiceSelect voice list follows model version', () => {
  it('shows the uranus (2.0) voice label for doubao-tts2.0', () => {
    render(
      <VoiceSelect
        model='doubao-tts2.0'
        onChange={() => {}}
        value='zh_female_vv_uranus_bigtts'
      />
    )
    const expected = DOUBAO_TTS2_VOICES.find(
      (v) => v.value === 'zh_female_vv_uranus_bigtts'
    )
    expect(expected).toBeDefined()
    expect(screen.getByText(expected!.label)).toBeInTheDocument()
  })

  it('shows the mars (1.0) voice label for doubao-tts', () => {
    render(
      <VoiceSelect
        model='doubao-tts'
        onChange={() => {}}
        value='zh_female_cancan_mars_bigtts'
      />
    )
    const expected = DOUBAO_TTS_VOICES.find(
      (v) => v.value === 'zh_female_cancan_mars_bigtts'
    )
    expect(expected).toBeDefined()
    expect(screen.getByText(expected!.label)).toBeInTheDocument()
  })
})
