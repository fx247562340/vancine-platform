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
import { BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  FAST_CODING_MODELS_ALTERNATE_MODELS,
  FAST_CODING_MODELS_CURL_EXAMPLE,
  FAST_CODING_MODELS_RESOURCE,
  FAST_CODING_MODELS_RESOURCE_EVENT,
  getFastCodingModelsCtaTarget,
} from '../lib/fast-coding-models'
import { CopyableCode } from './copyable-code'

export interface QuickstartProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Compact curl quickstart defaulting to glm-5.3-flash, with the other
 * three exact model ids listed beside it. Full coding-agent setup
 * (OpenCode / Cline / Roo Code) is intentionally linked instead of
 * duplicated — the docs Agent Integration Center stays the single
 * maintenance point.
 */
export function Quickstart(props: QuickstartProps): ReactElement {
  const { t } = useTranslation()
  const docsTarget = getFastCodingModelsCtaTarget(
    props.isAuthenticated,
    'docs',
    props.search
  )

  return (
    <section
      id='quickstart'
      aria-labelledby='fast-coding-models-quickstart-title'
      className='mx-auto w-full max-w-4xl px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2
          id='fast-coding-models-quickstart-title'
          className='text-3xl font-bold'
        >
          {t('Quickstart')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Send your first request with curl, then switch models by changing only the model field.'
          )}
        </p>
      </div>

      <div className='mt-6'>
        <CopyableCode code={FAST_CODING_MODELS_CURL_EXAMPLE} label='curl' />
      </div>

      <p className='text-muted-foreground mt-4 text-sm'>
        {t(
          'Switch to any of the other three models by changing only the model field:'
        )}
      </p>
      <ul className='mt-2 flex flex-wrap gap-2'>
        {FAST_CODING_MODELS_ALTERNATE_MODELS.map((modelId) => (
          <li key={modelId}>
            <code className='bg-muted/60 rounded-md px-2 py-1 font-mono text-sm'>
              {modelId}
            </code>
          </li>
        ))}
      </ul>

      <div className='mt-8'>
        <Button
          variant='outline'
          render={<Link to='/docs/agents' search={docsTarget.search} />}
          onClick={() =>
            trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
              resource: FAST_CODING_MODELS_RESOURCE,
              location: 'quickstart_docs',
            })
          }
        >
          <HugeiconsIcon
            icon={BookOpen01Icon}
            data-icon='inline-start'
            aria-hidden='true'
          />
          {t('Set up OpenCode, Cline, or Roo Code')}
        </Button>
      </div>
    </section>
  )
}
