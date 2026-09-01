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
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { hasPreviewTag } from '@/features/home/lib/homepage-pricing'
import type { PricingModel } from '@/features/pricing/types'
import { getLobeIcon } from '@/lib/lobe-icon'

import { useFastCodingModelsPricing } from '../hooks/use-fast-coding-models-pricing'
import {
  FAST_CODING_MODELS_CAPABILITY_LABEL_KEY,
  FAST_CODING_MODELS_MODALITY_LABEL_KEY,
  formatFastCodingModelsTokenCount,
  getFastCodingModelsPriceSummary,
} from '../lib/fast-coding-models'
import { FAST_CODING_MODELS_COMPARISON_SECTION_ID } from './hero'

/**
 * Side-by-side comparison of every fast-tagged model. Desktop gets a
 * semantic table; below the md breakpoint the same facts render as
 * readable cards — the page never scrolls horizontally. Platform facts
 * come from live pricing metadata; there is no per-id editorial row.
 */
export function Comparison(): ReactElement {
  const { t } = useTranslation()
  const pricing = useFastCodingModelsPricing()
  const models = pricing.models

  const hasContext = models.some(
    (model) => model.context_length !== undefined
  )
  const hasMaxOutput = models.some(
    (model) => model.max_output_tokens !== undefined
  )

  return (
    <section
      id={FAST_CODING_MODELS_COMPARISON_SECTION_ID}
      aria-labelledby='fast-coding-models-comparison-title'
      className='border-border/40 scroll-mt-24 border-t px-4 py-16 md:px-6'
    >
      <div className='mx-auto max-w-6xl'>
        <div className='mb-4 flex flex-col gap-2'>
          <h2
            id='fast-coding-models-comparison-title'
            className='text-3xl font-bold'
          >
            {t('Comparison')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Platform facts below come from live pricing metadata. Catalog description is shown on each card.'
            )}
          </p>
        </div>

        {pricing.isLoading && (
          <div
            data-testid='fast-coding-models-comparison-loading'
            className='flex flex-col gap-2'
          >
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-10 w-full' />
          </div>
        )}

        {!pricing.isLoading && pricing.error && (
          <p
            data-testid='fast-coding-models-comparison-error'
            className='text-muted-foreground bg-muted/40 border-border mb-4 rounded-lg border p-4 text-sm'
          >
            {t(
              'Live pricing is unavailable right now. The guide and the CTAs still work; check the pricing page for the latest figures.'
            )}
          </p>
        )}

        {!pricing.isLoading && models.length === 0 && !pricing.error && (
          <p
            data-testid='fast-coding-models-comparison-empty'
            className='text-muted-foreground bg-muted/40 border-border rounded-lg border p-4 text-sm'
          >
            {t('No fast models are listed in the public catalog right now.')}
          </p>
        )}

        {!pricing.isLoading && models.length > 0 && (
          <>
            {/* Desktop: semantic comparison table inside a local horizontal
                scroll container. The wrapper carries role="region" with an
                aria-label so keyboard and assistive tech users can name and
                scroll the table independently; the table itself never causes
                page-level horizontal overflow because the wrapper contains
                any column overflow. min-w makes each model column at least
                180px wide so additional fast models remain readable. */}
            <div
              data-testid='fast-coding-models-comparison-table'
              role='region'
              aria-label={t('Comparison')}
              className='hidden overflow-x-auto md:block'
            >
              <table className='w-full min-w-[180px] border-separate border-spacing-0 text-sm'
                style={{ minWidth: `${Math.max(models.length, 1) * 180 + 200}px` }}
              >
                <caption className='sr-only'>{t('Comparison')}</caption>
                <thead>
                  <tr>
                    <th
                      scope='col'
                      className='text-muted-foreground p-3 text-left align-bottom text-xs font-semibold tracking-widest uppercase'
                    >
                      {t('Model')}
                    </th>
                    {models.map((model) => (
                      <th
                        key={model.model_name}
                        scope='col'
                        className='border-border border-b p-3 text-left align-bottom'
                      >
                        <span className='flex items-center gap-2'>
                          {/* Decorative: the model id text is the accessible name;
                              aria-hidden also keeps the missing-icon fallback out of
                              the accessibility tree. */}
                          <span aria-hidden='true' className='shrink-0'>
                            {getLobeIcon(model.icon, 20)}
                          </span>
                          <code className='font-mono text-sm font-semibold'>
                            {model.model_name}
                          </code>
                        </span>
                        {hasPreviewTag(model.tags) && (
                          <Badge variant='secondary' className='mt-1.5'>
                            {t('Preview')}
                          </Badge>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label={t('Input price')}
                    unit={t('per 1M tokens')}
                  >
                    {models.map((model) => (
                      <td
                        key={model.model_name}
                        className='border-border border-b p-3'
                      >
                        {priceOf(model)?.input ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow
                    label={t('Output price')}
                    unit={t('per 1M tokens')}
                  >
                    {models.map((model) => (
                      <td
                        key={model.model_name}
                        className='border-border border-b p-3'
                      >
                        {priceOf(model)?.output ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow
                    label={t('Cache read price')}
                    unit={t('per 1M tokens')}
                  >
                    {models.map((model) => (
                      <td
                        key={model.model_name}
                        className='border-border border-b p-3'
                      >
                        {priceOf(model)?.cache ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow label={t('Input modalities')}>
                    {models.map((model) => (
                      <td
                        key={model.model_name}
                        className='border-border border-b p-3'
                      >
                        {modalitiesOf(model, t)}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow label={t('Capabilities')}>
                    {models.map((model) => (
                      <td
                        key={model.model_name}
                        className='border-border border-b p-3'
                      >
                        {capabilitiesOf(model, t)}
                      </td>
                    ))}
                  </ComparisonRow>
                  {hasContext && (
                    <ComparisonRow label={t('Context window')}>
                      {models.map((model) => (
                        <td
                          key={model.model_name}
                          className='border-border border-b p-3'
                        >
                          {formatFastCodingModelsTokenCount(
                            model.context_length
                          ) ?? '—'}
                        </td>
                      ))}
                    </ComparisonRow>
                  )}
                  {hasMaxOutput && (
                    <ComparisonRow label={t('Max output')}>
                      {models.map((model) => (
                        <td
                          key={model.model_name}
                          className='border-border border-b p-3'
                        >
                          {formatFastCodingModelsTokenCount(
                            model.max_output_tokens
                          ) ?? '—'}
                        </td>
                      ))}
                    </ComparisonRow>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: readable cards, no horizontal overflow */}
            <div
              data-testid='fast-coding-models-comparison-cards'
              className='flex flex-col gap-4 md:hidden'
            >
              {models.map((model) => (
                <MobileComparisonCard key={model.model_name} model={model} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function priceOf(model: PricingModel) {
  return getFastCodingModelsPriceSummary(model)
}

function modalitiesOf(
  model: PricingModel,
  t: (key: string) => string
): string {
  const modalities = model.input_modalities
  if (!Array.isArray(modalities) || modalities.length === 0) return '—'
  return modalities
    .map((m) => t(FAST_CODING_MODELS_MODALITY_LABEL_KEY[m] ?? m))
    .join(' · ')
}

function capabilitiesOf(
  model: PricingModel,
  t: (key: string) => string
): string {
  const capabilities = model.capabilities
  if (!Array.isArray(capabilities) || capabilities.length === 0) return '—'
  return capabilities
    .map((c) => t(FAST_CODING_MODELS_CAPABILITY_LABEL_KEY[c] ?? c))
    .join(' · ')
}

function ComparisonRow(props: {
  label: string
  unit?: string
  children: ReactNode
}): ReactElement {
  return (
    <tr>
      <th scope='row' className='p-3 text-left align-top'>
        <span className='font-medium'>{props.label}</span>
        {props.unit && (
          <span className='text-muted-foreground block text-xs font-normal'>
            {props.unit}
          </span>
        )}
      </th>
      {props.children}
    </tr>
  )
}

function MobileComparisonCard(props: {
  model: PricingModel
}): ReactElement {
  const { t } = useTranslation()
  const model: PricingModel = props.model
  const prices = priceOf(model)
  const context = formatFastCodingModelsTokenCount(model.context_length)
  const maxOutput = formatFastCodingModelsTokenCount(model.max_output_tokens)

  return (
    <div
      className='bg-card border-border rounded-xl border p-4'
      data-testid={`fast-coding-comparison-card-${model.model_name}`}
    >
      <div className='flex items-center gap-2'>
        {/* Decorative: the model id text is the accessible name; aria-hidden
            also keeps the missing-icon fallback out of the accessibility tree. */}
        <span aria-hidden='true' className='shrink-0'>
          {getLobeIcon(model.icon, 20)}
        </span>
        <code className='font-mono text-sm font-semibold'>
          {model.model_name}
        </code>
        {hasPreviewTag(model.tags) && (
          <Badge variant='secondary'>{t('Preview')}</Badge>
        )}
      </div>
      <dl className='mt-3 grid grid-cols-3 gap-2 text-sm'>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>{t('Input price')}</dt>
          <dd className='font-medium'>{prices?.input ?? '—'}</dd>
        </div>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>{t('Output price')}</dt>
          <dd className='font-medium'>{prices?.output ?? '—'}</dd>
        </div>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>
            {t('Cache read price')}
          </dt>
          <dd className='font-medium'>{prices?.cache ?? '—'}</dd>
        </div>
      </dl>
      <ul className='text-muted-foreground mt-3 flex flex-col gap-1 text-xs'>
        <li>
          {t('Input modalities')}: {modalitiesOf(model, t)}
        </li>
        <li>
          {t('Capabilities')}: {capabilitiesOf(model, t)}
        </li>
        {context && (
          <li>
            {t('Context window')}: {context}
          </li>
        )}
        {maxOutput && (
          <li>
            {t('Max output')}: {maxOutput}
          </li>
        )}
      </ul>
    </div>
  )
}
