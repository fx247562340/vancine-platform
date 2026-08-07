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
// DatePicker / DateTimePicker zh-TW locale wiring test. Housed under
// docs/__tests__ only because that is the fixed vitest scope (jsdom + `@`
// alias); it is not a Docs feature test.
//
// zhTW and zhCN render identical glyphs in jsdom, so instead of comparing
// pixels we verify the WIRING directly: the Calendar primitive is stubbed to
// expose the `locale.code` it receives. The pickers must hand it the zhTW
// locale (code 'zh-TW') when the UI language is zh-TW (or a Traditional
// variant), zhCN ('zh-CN') for Simplified, and enUS ('en-US') for English.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DatePicker } from '@/components/date-picker'
import { DateTimePicker } from '@/components/datetime-picker'

vi.mock('@/components/ui/calendar', () => ({
  Calendar: (props: { locale?: { code?: string } }) => (
    <div data-testid='calendar-locale'>{props.locale?.code ?? 'none'}</div>
  ),
}))

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: {
          translation: {
            'Pick a date': 'Pick a date',
            'Select date': 'Select date',
          },
        },
        zhCN: {
          translation: { 'Pick a date': '选择日期', 'Select date': '选择日期' },
        },
        zhTW: {
          translation: { 'Pick a date': '選擇日期', 'Select date': '選擇日期' },
        },
      },
      lng: 'en',
      fallbackLng: 'en',
      supportedLngs: ['en', 'zhCN', 'zhTW'],
      load: 'currentOnly',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  }
})

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

async function openFirstPopover() {
  await userEvent.click(screen.getAllByRole('button')[0])
  await waitFor(() =>
    expect(screen.queryByTestId('calendar-locale')).not.toBeNull()
  )
}

describe('DatePicker locale wiring', () => {
  it('zhTW selects the zhTW locale (code zh-TW)', async () => {
    await i18n.changeLanguage('zhTW')
    render(<DatePicker selected={new Date(2024, 0, 15)} onSelect={() => {}} />)
    await openFirstPopover()
    expect(screen.getByTestId('calendar-locale').textContent).toBe('zh-TW')
  })

  it('zhCN selects the zhCN locale (code zh-CN)', async () => {
    await i18n.changeLanguage('zhCN')
    render(<DatePicker selected={new Date(2024, 0, 15)} onSelect={() => {}} />)
    await openFirstPopover()
    expect(screen.getByTestId('calendar-locale').textContent).toBe('zh-CN')
  })

  it('en selects enUS (code en-US)', async () => {
    render(<DatePicker selected={new Date(2024, 0, 15)} onSelect={() => {}} />)
    await openFirstPopover()
    expect(screen.getByTestId('calendar-locale').textContent).toBe('en-US')
  })
})

describe('DateTimePicker locale wiring', () => {
  it('zhTW selects the zhTW locale (code zh-TW)', async () => {
    await i18n.changeLanguage('zhTW')
    render(<DateTimePicker value={new Date(2024, 0, 15)} onChange={() => {}} />)
    await openFirstPopover()
    expect(screen.getByTestId('calendar-locale').textContent).toBe('zh-TW')
  })

  it('zhCN selects the zhCN locale (code zh-CN)', async () => {
    await i18n.changeLanguage('zhCN')
    render(<DateTimePicker value={new Date(2024, 0, 15)} onChange={() => {}} />)
    await openFirstPopover()
    expect(screen.getByTestId('calendar-locale').textContent).toBe('zh-CN')
  })
})
