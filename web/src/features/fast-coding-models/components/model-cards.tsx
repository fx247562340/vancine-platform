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

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { hasPreviewTag } from '@/features/home/lib/homepage-pricing'
import type { PricingModel } from '@/features/pricing/types'
import { trackEvent } from '@/lib/analytics'
import { getLobeIcon } from '@/lib/lobe-icon'

import { useFastCodingModelsPricing } from '../hooks/use-fast-coding-models-pricing'
import {
  FAST_CODING_MODELS_CAPABILITY_LABEL_KEY,
  FAST_CODING_MODELS_GENERIC_GUIDANCE_KEY,
  FAST_CODING_MODELS_MODALITY_LABEL_KEY,
  FAST_CODING_MODELS_RESOURCE,
  FAST_CODING_MODELS_RESOURCE_EVENT,
  formatFastCodingModelsTokenCount,
  getFastCodingModelsPriceSummary,
} from '../lib/fast-coding-models'

const SKELETON_CARDS = ['first', 'second', 'third', 'fourth'] as const

/**
 * Dynamic model cards. Every card is a model from the live /api/pricing
 * payload that carries the exact "fast" tag. There is no fixed count,
 * no allowlist, and no fallback to a different model. Loading renders
 * a stable four-card skeleton, a failed request renders an inline
 * banner, and an empty fast catalog renders a clean empty state with
 * a link to the full model square — never a placeholder or substitute.
 */
export function ModelCards(): ReactElement {
  const { t } = useTranslation()
  const pricing = useFastCodingModelsPricing()

  return (
    <section
      aria-labelledby='fast-coding-models-cards-title'
      className='border-border/40 border-t px-4 py-16 md:px-6'
    >
      <div className='mx-auto max-w-6xl'>
        <div className='mb-10 flex flex-col gap-2'>
          <h2
            id='fast-coding-models-cards-title'
            className='text-3xl font-bold'
          >
            {t('Pick the model that fits your agent')}
          </h2>
          <p className='text-muted-foreground'>
            {t(
              'Live pricing and capabilities are read from the Vancine pricing API.'
            )}
          </p>
        </div>

        {pricing.isLoading && (
          <div
            data-testid='fast-coding-models-cards-loading'
            className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
          >
            {SKELETON_CARDS.map((key) => (
              <Card key={key}>
                <CardHeader>
                  <Skeleton className='size-8 rounded-lg' />
                  <Skeleton className='mt-2 h-5 w-3/4' />
                  <Skeleton className='h-4 w-full' />
                </CardHeader>
                <CardContent className='flex flex-col gap-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-4 w-2/3' />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!pricing.isLoading && pricing.error && (
          <div
            data-testid='fast-coding-models-cards-error'
            className='bg-muted/40 border-border rounded-xl border p-6 text-center'
          >
            <p className='text-muted-foreground text-sm'>
              {t(
                'Live pricing is unavailable right now. The guide and the CTAs still work; check the pricing page for the latest figures.'
              )}
            </p>
            <Link
              to='/pricing'
              className='text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline'
              onClick={() =>
                trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
                  resource: 'pricing',
                  location: 'fast_coding_models_cards_error',
                })
              }
            >
              {t('View live pricing')}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className='size-3.5'
                aria-hidden='true'
              />
            </Link>
          </div>
        )}

        {!pricing.isLoading &&
          !pricing.error &&
          pricing.models.length === 0 && (
            <div
              data-testid='fast-coding-models-cards-empty'
              className='bg-muted/40 border-border rounded-xl border p-6 text-center'
            >
              <p className='text-muted-foreground text-sm'>
                {t(
                  'No fast models are listed in the public catalog right now.'
                )}
              </p>
              <Link
                to='/pricing'
                className='text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline'
                onClick={() =>
                  trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
                    resource: 'pricing',
                    location: 'fast_coding_models_cards_empty',
                  })
                }
              >
                {t('View live pricing')}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className='size-3.5'
                  aria-hidden='true'
                />
              </Link>
            </div>
          )}

        {!pricing.isLoading && !pricing.error && pricing.models.length > 0 && (
          <div
            className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
            data-testid='fast-coding-models-cards-grid'
          >
            {pricing.models.map((model) => (
              <ModelCard key={model.model_name} model={model} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ModelCard(props: { model: PricingModel }): ReactElement {
  const { t } = useTranslation()
  const model = props.model
  const isPreview = hasPreviewTag(model.tags)

  return (
    <Card data-testid={`fast-coding-model-card-${model.model_name}`}>
      <CardHeader>
        <div className='flex items-center gap-2.5'>
          {/* Decorative: the model id text is the accessible name; aria-hidden
              also keeps the missing-icon fallback out of the accessibility tree. */}
          <span aria-hidden='true' className='shrink-0'>
            {getLobeIcon(model.icon, 32)}
          </span>
          <div className='flex min-w-0 flex-col'>
            <code className='truncate font-mono text-sm font-semibold'>
              {model.model_name}
            </code>
            {isPreview && (
              <Badge variant='secondary' className='mt-1 w-fit'>
                {t('Preview')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-3'>
        <ModelFacts model={model} />
      </CardContent>
    </Card>
  )
}

function ModelFacts(props: { model: PricingModel }): ReactElement {
  const { t } = useTranslation()
  const model = props.model
  const prices = getFastCodingModelsPriceSummary(model)
  const context = formatFastCodingModelsTokenCount(model.context_length)
  const maxOutput = formatFastCodingModelsTokenCount(model.max_output_tokens)
  const modalities = Array.isArray(model.input_modalities)
    ? model.input_modalities
    : []
  const capabilities = Array.isArray(model.capabilities)
    ? model.capabilities
    : []

  return (
    <div className='flex flex-1 flex-col gap-3'>
      {model.description && (
        <p className='text-muted-foreground line-clamp-3 text-sm'>
          {model.description}
        </p>
      )}

      <dl className='grid grid-cols-3 gap-2 text-sm'>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>{t('Input')}</dt>
          <dd className='font-medium'>{prices.input ?? '—'}</dd>
        </div>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>{t('Output')}</dt>
          <dd className='font-medium'>{prices.output ?? '—'}</dd>
        </div>
        <div className='flex flex-col gap-0.5'>
          <dt className='text-muted-foreground text-xs'>{t('Cache read')}</dt>
          <dd className='font-medium'>{prices.cache ?? '—'}</dd>
        </div>
      </dl>

      <ul className='text-muted-foreground flex flex-col gap-1 text-xs'>
        {context && (
          <li>
            {t('Context')}: <span className='text-foreground'>{context}</span>
          </li>
        )}
        {maxOutput && (
          <li>
            {t('Max output')}:{' '}
            <span className='text-foreground'>{maxOutput}</span>
          </li>
        )}
        {modalities.length > 0 && (
          <li>
            {t('Inputs')}:{' '}
            <span className='text-foreground'>
              {modalities
                .map((m) => t(FAST_CODING_MODELS_MODALITY_LABEL_KEY[m] ?? m))
                .join(' · ')}
            </span>
          </li>
        )}
        {capabilities.length > 0 && (
          <li>
            {t('Capabilities')}:{' '}
            <span className='text-foreground'>
              {capabilities
                .map((c) => t(FAST_CODING_MODELS_CAPABILITY_LABEL_KEY[c] ?? c))
                .join(' · ')}
            </span>
          </li>
        )}
      </ul>

      <p className='border-border text-muted-foreground border-t pt-3 text-xs italic'>
        {t(FAST_CODING_MODELS_GENERIC_GUIDANCE_KEY)}
      </p>

      <Link
        to='/pricing/$modelId'
        params={{ modelId: model.model_name }}
        className='text-primary mt-auto inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline'
        onClick={() =>
          trackEvent(FAST_CODING_MODELS_RESOURCE_EVENT, {
            resource: FAST_CODING_MODELS_RESOURCE,
            location: 'model_card',
          })
        }
      >
        {t('Model details')}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className='size-3.5'
          aria-hidden='true'
        />
      </Link>
    </div>
  )
}
