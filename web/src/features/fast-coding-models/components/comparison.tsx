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
import type { PricingModel } from '@/features/pricing/types'
import { getLobeIcon } from '@/lib/lobe-icon'

import { useFastCodingModelsPricing } from '../hooks/use-fast-coding-models-pricing'
import {
  FAST_CODING_MODEL_GUIDANCE_KEY,
  FAST_CODING_MODEL_PREVIEW,
  FAST_CODING_MODELS_CAPABILITY_LABEL_KEY,
  FAST_CODING_MODELS_MODALITY_LABEL_KEY,
  formatFastCodingModelsTokenCount,
  getFastCodingModelsPriceSummary,
  type FastCodingModelsPricingSlot,
} from '../lib/fast-coding-models'
import { FAST_CODING_MODELS_COMPARISON_SECTION_ID } from './hero'

/**
 * Side-by-side comparison of the four exact models. Desktop gets a
 * semantic table; below the md breakpoint the same facts render as four
 * readable cards — the page never scrolls horizontally. Platform facts
 * come from live pricing metadata; the "Consider when…" row is
 * editorial guidance and is visually marked as such.
 */
export function Comparison(): ReactElement {
  const { t } = useTranslation()
  const pricing = useFastCodingModelsPricing()
  const slots = pricing.slots

  const hasContext = slots.some(
    (slot) => slot.model?.context_length !== undefined
  )
  const hasMaxOutput = slots.some(
    (slot) => slot.model?.max_output_tokens !== undefined
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
              'Platform facts below come from live pricing metadata. Editorial guidance is marked separately.'
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

        {!pricing.isLoading && (
          <>
            {/* Desktop: semantic comparison table */}
            <div
              data-testid='fast-coding-models-comparison-table'
              className='hidden md:block'
            >
              <table className='w-full border-separate border-spacing-0 text-sm'>
                <caption className='sr-only'>{t('Comparison')}</caption>
                <thead>
                  <tr>
                    <th
                      scope='col'
                      className='text-muted-foreground p-3 text-left align-bottom text-xs font-semibold tracking-widest uppercase'
                    >
                      {t('Model')}
                    </th>
                    {slots.map((slot) => (
                      <th
                        key={slot.modelId}
                        scope='col'
                        className='border-border border-b p-3 text-left align-bottom'
                      >
                        <span className='flex items-center gap-2'>
                          {/* Decorative: the model id text is the accessible name;
                              aria-hidden also keeps the missing-icon fallback out of
                              the accessibility tree. */}
                          <span aria-hidden='true' className='shrink-0'>
                            {getLobeIcon(
                              slot.model?.icon ?? slot.model?.vendor_icon,
                              20
                            )}
                          </span>
                          <code className='font-mono text-sm font-semibold'>
                            {slot.modelId}
                          </code>
                        </span>
                        {FAST_CODING_MODEL_PREVIEW[slot.modelId] && (
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
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='border-border border-b p-3'
                      >
                        {priceOf(slot)?.input ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow
                    label={t('Output price')}
                    unit={t('per 1M tokens')}
                  >
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='border-border border-b p-3'
                      >
                        {priceOf(slot)?.output ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow
                    label={t('Cache read price')}
                    unit={t('per 1M tokens')}
                  >
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='border-border border-b p-3'
                      >
                        {priceOf(slot)?.cache ?? '—'}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow label={t('Input modalities')}>
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='border-border border-b p-3'
                      >
                        {modalitiesOf(slot, t)}
                      </td>
                    ))}
                  </ComparisonRow>
                  <ComparisonRow label={t('Capabilities')}>
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='border-border border-b p-3'
                      >
                        {capabilitiesOf(slot, t)}
                      </td>
                    ))}
                  </ComparisonRow>
                  {hasContext && (
                    <ComparisonRow label={t('Context window')}>
                      {slots.map((slot) => (
                        <td
                          key={slot.modelId}
                          className='border-border border-b p-3'
                        >
                          {formatFastCodingModelsTokenCount(
                            slot.model?.context_length
                          ) ?? '—'}
                        </td>
                      ))}
                    </ComparisonRow>
                  )}
                  {hasMaxOutput && (
                    <ComparisonRow label={t('Max output')}>
                      {slots.map((slot) => (
                        <td
                          key={slot.modelId}
                          className='border-border border-b p-3'
                        >
                          {formatFastCodingModelsTokenCount(
                            slot.model?.max_output_tokens
                          ) ?? '—'}
                        </td>
                      ))}
                    </ComparisonRow>
                  )}
                  <tr data-testid='fast-coding-models-guidance-row'>
                    <th scope='row' className='p-3 text-left align-top'>
                      <span className='font-medium'>{t('Consider when…')}</span>{' '}
                      <Badge variant='outline'>{t('Editorial guidance')}</Badge>
                    </th>
                    {slots.map((slot) => (
                      <td
                        key={slot.modelId}
                        className='text-muted-foreground p-3 align-top text-xs italic'
                      >
                        {t(FAST_CODING_MODEL_GUIDANCE_KEY[slot.modelId])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile: four readable cards, no horizontal overflow */}
            <div
              data-testid='fast-coding-models-comparison-cards'
              className='flex flex-col gap-4 md:hidden'
            >
              {slots.map((slot) => (
                <MobileComparisonCard key={slot.modelId} slot={slot} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function priceOf(slot: FastCodingModelsPricingSlot) {
  return slot.model ? getFastCodingModelsPriceSummary(slot.model) : null
}

function modalitiesOf(
  slot: FastCodingModelsPricingSlot,
  t: (key: string) => string
): string {
  const modalities = slot.model?.input_modalities
  if (!Array.isArray(modalities) || modalities.length === 0) return '—'
  return modalities
    .map((m) => t(FAST_CODING_MODELS_MODALITY_LABEL_KEY[m] ?? m))
    .join(' · ')
}

function capabilitiesOf(
  slot: FastCodingModelsPricingSlot,
  t: (key: string) => string
): string {
  const capabilities = slot.model?.capabilities
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
  slot: FastCodingModelsPricingSlot
}): ReactElement {
  const { t } = useTranslation()
  const model: PricingModel | null = props.slot.model
  const prices = priceOf(props.slot)
  const context = formatFastCodingModelsTokenCount(model?.context_length)
  const maxOutput = formatFastCodingModelsTokenCount(model?.max_output_tokens)

  return (
    <div className='bg-card border-border rounded-xl border p-4'>
      <div className='flex items-center gap-2'>
        {/* Decorative: the model id text is the accessible name; aria-hidden
            also keeps the missing-icon fallback out of the accessibility tree. */}
        <span aria-hidden='true' className='shrink-0'>
          {getLobeIcon(model?.icon ?? model?.vendor_icon, 20)}
        </span>
        <code className='font-mono text-sm font-semibold'>
          {props.slot.modelId}
        </code>
        {FAST_CODING_MODEL_PREVIEW[props.slot.modelId] && (
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
          {t('Input modalities')}: {modalitiesOf(props.slot, t)}
        </li>
        <li>
          {t('Capabilities')}: {capabilitiesOf(props.slot, t)}
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
      <p className='border-border text-muted-foreground mt-3 border-t pt-3 text-xs italic'>
        <Badge variant='outline' className='mb-1 not-italic'>
          {t('Editorial guidance')}
        </Badge>
        {t(FAST_CODING_MODEL_GUIDANCE_KEY[props.slot.modelId])}
      </p>
    </div>
  )
}
