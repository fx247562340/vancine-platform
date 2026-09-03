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

import { useFastCodingModelsPricing } from '../hooks/use-fast-coding-models-pricing'
import {
  FAST_CODING_MODELS_RESOURCE,
  FAST_CODING_MODELS_RESOURCE_EVENT,
  buildFastCodingModelsCtaSearch,
  getFastCodingModelsCurlExample,
} from '../lib/fast-coding-models'
import { CopyableCode } from './copyable-code'

export interface QuickstartProps {
  isAuthenticated: boolean
  /** The raw query string of the landing page URL. */
  search: string
}

/**
 * Compact curl quickstart with a dynamic default model and dynamic
 * alternate chips. The default is the first live fast-tagged model
 * (sorted case-insensitive by model_name); alternates are every other
 * fast-tagged model. When the fast catalog is empty, no curl is
 * rendered and a clear empty state is shown instead.
 *
 * Full coding-agent setup (OpenCode / Cline / Roo Code) is
 * intentionally linked instead of duplicated — the docs Agent
 * Integration Center stays the single maintenance point.
 */
export function Quickstart(props: QuickstartProps): ReactElement {
  const { t } = useTranslation()
  const pricing = useFastCodingModelsPricing()
  const docsTarget = buildFastCodingModelsCtaSearch('docs', props.search)

  const defaultModel = pricing.models[0] ?? null
  const alternates = pricing.models.slice(1)
  const curlExample = getFastCodingModelsCurlExample(
    defaultModel?.model_name ?? null
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

      {curlExample ? (
        <div className='mt-6'>
          <CopyableCode code={curlExample} label='curl' />
        </div>
      ) : (
        <p
          data-testid='fast-coding-models-curl-empty'
          className='text-muted-foreground bg-muted/40 border-border mt-6 rounded-lg border p-4 text-sm'
        >
          {t('No code sample is available while the fast catalog is empty.')}
        </p>
      )}

      {alternates.length > 0 && (
        <>
          <p className='text-muted-foreground mt-4 text-sm'>
            {t(
              'Switch to any of the other fast models by changing only the model field:'
            )}
          </p>
          <ul
            className='mt-2 flex flex-wrap gap-2'
            data-testid='fast-coding-models-alternate-list'
          >
            {alternates.map((model) => (
              <li key={model.model_name}>
                <code className='bg-muted/60 rounded-md px-2 py-1 font-mono text-sm'>
                  {model.model_name}
                </code>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className='mt-8'>
        <Button
          variant='outline'
          render={<Link to='/docs/agents' search={docsTarget} />}
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
        <p className='text-muted-foreground mt-3 text-sm'>
          <Link
            to='/docs/agents/opencode'
            className='text-primary font-medium underline underline-offset-4'
          >
            {t(
              'Connect Vancine in OpenCode with /connect — no manual provider JSON required.'
            )}
          </Link>
        </p>
      </div>
    </section>
  )
}
