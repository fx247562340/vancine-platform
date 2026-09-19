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
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import enLocale from '@/i18n/locales/en.json'

import type { PricingModel } from '../../types'
import { ModelDetailsApi } from '../model-details-api'

// Public, credential-free server_address keeps the rendered URL stable and
// makes the assertion check only the code-sample text.
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: { server_address: 'https://vancine.com' },
    loading: false,
    error: null,
  }),
}))

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

const baseModel: PricingModel = {
  id: 1,
  model_name: 'gpt-4o-mini',
  quota_type: 1,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai-chat'],
}

const endpointMap = {
  'openai-chat': { path: '/v1/chat/completions', method: 'POST' },
}

function getCodeSample(container: HTMLElement): string {
  const host = container.querySelector<HTMLElement>('[role="textbox"]')
  expect(host).not.toBeNull()
  return (host as HTMLElement).textContent ?? ''
}

beforeEach(async () => {
  await initGlobalI18n()
})

describe('ModelDetailsApi code samples expose Vancine env-var name', () => {
  it('renders the cURL example with $VANCINE_API_KEY and never NEW_API_KEY', () => {
    const { container } = render(
      <ModelDetailsApi model={baseModel} endpointMap={endpointMap} />
    )

    // The "Code samples" heading confirms the section rendered; the cURL
    // tab is the default, so the first code-block is the cURL sample.
    expect(screen.getByText('Code samples')).toBeInTheDocument()

    const sample = getCodeSample(container)

    expect(sample).toContain('Authorization: Bearer $VANCINE_API_KEY')
    expect(sample).not.toContain('NEW_API_KEY')
  })
})
