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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

import {
  FAST_CODING_MODELS_EVIDENCE_KEYS,
  FAST_CODING_MODELS_RESOURCE,
  FAST_CODING_MODELS_RESOURCE_EVENT,
} from '../lib/fast-coding-models'

/**
 * Evidence boundary: this guide is a selection guide for the live
 * fast-tagged catalog, not a benchmark. The benchmark page is
 * linked as a separate, single-source-of-truth for measured
 * performance; this guide never extrapolates any benchmark result to
 * fast-tagged models that were not actually tested.
 */
export function EvidenceBoundary(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='fast-coding-models-evidence-title'
      className='border-border/40 border-t px-4 py-16 md:px-6'
    >
      <div
        data-testid='fast-coding-models-evidence-boundary'
        className='bg-muted/30 border-border mx-auto max-w-3xl rounded-2xl border p-6 md:p-8'
      >
        <h2
          id='fast-coding-models-evidence-title'
          className='text-2xl font-bold'
        >
          {t('Measured results are separate')}
        </h2>
        <p className='text-muted-foreground mt-2 text-sm'>
          {t(
            'This page is a selection guide for fast-inference models, not a benchmark.'
          )}
        </p>
        <ul className='text-muted-foreground mt-4 flex list-disc flex-col gap-2 pl-5 text-sm'>
          {FAST_CODING_MODELS_EVIDENCE_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <Button
          variant='outline'
          className='mt-6'
          render={<Link to='/coding-agent-benchmark' />}
          onClick={() =>
            trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
              resource: FAST_CODING_MODELS_RESOURCE,
              location: 'evidence_boundary',
            })
          }
        >
          {t('View the benchmark')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            data-icon='inline-end'
            aria-hidden='true'
          />
        </Button>
      </div>
    </section>
  )
}
