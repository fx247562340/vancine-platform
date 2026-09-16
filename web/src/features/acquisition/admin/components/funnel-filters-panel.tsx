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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { buildFunnelFilterSchema, buildFunnelFormDefaults } from '../lib'
import type { AcquisitionFunnelFormValues } from '../types'

interface FunnelFiltersPanelProps {
  /** Filters the current query was fetched with (used for Reset). */
  appliedFilters: AcquisitionFunnelFormValues
  /** Commit a validated filter set; runs exactly one query. */
  onApply: (values: AcquisitionFunnelFormValues) => void
  /** Restore the default UTC window and clear the text filters. */
  onReset: () => void
}

/**
 * Filter form for the funnel. Validation runs entirely client-side with
 * React Hook Form + Zod; an invalid filter set never reaches the API because
 * Apply only fires on a valid submit.
 */
export function FunnelFiltersPanel(props: FunnelFiltersPanelProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildFunnelFilterSchema(t), [t])
  const form = useForm<AcquisitionFunnelFormValues>({
    resolver: zodResolver(schema),
    defaultValues: props.appliedFilters,
  })

  const submit = form.handleSubmit((values) => {
    props.onApply(values)
  })

  const reset = () => {
    const defaults = buildFunnelFormDefaults()
    form.reset(defaults)
    props.onReset()
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event)
      }}
      className='grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-5'
      noValidate
    >
      <div className='flex flex-col gap-1'>
        <label
          htmlFor='funnel-from'
          className='text-muted-foreground text-xs font-medium'
        >
          {t('From date (UTC, inclusive)')}
        </label>
        <Input
          id='funnel-from'
          type='text'
          inputMode='numeric'
          placeholder='YYYY-MM-DD'
          aria-invalid={Boolean(form.formState.errors.from)}
          {...form.register('from')}
        />
        {form.formState.errors.from && (
          <p className='text-destructive text-xs'>
            {t(String(form.formState.errors.from.message))}
          </p>
        )}
      </div>
      <div className='flex flex-col gap-1'>
        <label
          htmlFor='funnel-to'
          className='text-muted-foreground text-xs font-medium'
        >
          {t('To date (UTC, exclusive)')}
        </label>
        <Input
          id='funnel-to'
          type='text'
          inputMode='numeric'
          placeholder='YYYY-MM-DD'
          aria-invalid={Boolean(form.formState.errors.to)}
          {...form.register('to')}
        />
        {form.formState.errors.to && (
          <p className='text-destructive text-xs'>
            {t(String(form.formState.errors.to.message))}
          </p>
        )}
      </div>
      <div className='flex flex-col gap-1'>
        <label
          htmlFor='funnel-utm-source'
          className='text-muted-foreground text-xs font-medium'
        >
          {t('UTM source')}
        </label>
        <Input
          id='funnel-utm-source'
          type='text'
          placeholder={t('Exact match, optional')}
          {...form.register('utm_source')}
        />
      </div>
      <div className='flex flex-col gap-1'>
        <label
          htmlFor='funnel-utm-campaign'
          className='text-muted-foreground text-xs font-medium'
        >
          {t('UTM campaign')}
        </label>
        <Input
          id='funnel-utm-campaign'
          type='text'
          placeholder={t('Exact match, optional')}
          {...form.register('utm_campaign')}
        />
      </div>
      <div className='flex flex-col gap-1'>
        <label
          htmlFor='funnel-model'
          className='text-muted-foreground text-xs font-medium'
        >
          {t('Model')}
        </label>
        <Input
          id='funnel-model'
          type='text'
          placeholder={t('Exact match, optional')}
          {...form.register('model')}
        />
      </div>
      <div className='flex items-center gap-2 sm:col-span-2 lg:col-span-5'>
        <Button type='submit' size='sm'>
          {t('Apply Filters')}
        </Button>
        <Button type='button' variant='outline' size='sm' onClick={reset}>
          {t('Reset')}
        </Button>
      </div>
    </form>
  )
}
