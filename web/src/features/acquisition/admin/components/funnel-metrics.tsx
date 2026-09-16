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
import {
  Activity01Icon,
  EarthIcon,
  Key01Icon,
  Target01Icon,
  UserAdd01Icon,
  UserCheck01Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  formatCoverageTimestamp,
  formatFunnelCount,
  formatFunnelRate,
  getCompletenessStyle,
  getEchoedFilterChips,
} from '../lib'
import type { AcquisitionCompleteness, AcquisitionFunnelResult } from '../types'

const FUNNEL_ICONS = [
  EarthIcon,
  UserAdd01Icon,
  UserCheck01Icon,
  Key01Icon,
  Activity01Icon,
] as const

// Target01Icon / UserMultiple02Icon are used by the conversions and coverage
// section headers respectively.
const CONVERSIONS_ICON = Target01Icon
const COVERAGE_ICON = UserMultiple02Icon

interface FunnelMetricsGridProps {
  data: AcquisitionFunnelResult
  loading: boolean
}

/**
 * The five funnel counts in order. Real zeros render as "0"; a null metric
 * (backend could not compute it) renders the Unavailable label instead.
 */
export function FunnelMetricsGrid(props: FunnelMetricsGridProps) {
  const { t } = useTranslation()
  const counts = [
    {
      label: t('Landing views'),
      value: formatFunnelCount(props.data.landing_view),
    },
    {
      label: t('Signup started'),
      value: formatFunnelCount(props.data.signup_started),
    },
    {
      label: t('Signup completed'),
      value: formatFunnelCount(props.data.signup_completed),
    },
    {
      label: t('API keys created'),
      value: formatFunnelCount(props.data.api_key_created),
      note: t('Includes the default token created automatically at signup'),
    },
    {
      label: t('First successful API calls'),
      value: formatFunnelCount(props.data.first_api_call_succeeded),
    },
  ]

  return (
    <div className='grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5'>
      {counts.map((count, index) => (
        <div key={count.label} className='bg-card rounded-lg border p-3'>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
            <HugeiconsIcon
              icon={FUNNEL_ICONS[index]}
              className='size-3.5 shrink-0'
              aria-hidden='true'
            />
            <span className='line-clamp-2 leading-tight'>{count.label}</span>
          </div>
          {props.loading ? (
            <Skeleton className='mt-2 h-7 w-16' />
          ) : (
            <div className='text-foreground mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl'>
              {count.value}
            </div>
          )}
          {count.note && !props.loading && (
            <p className='text-muted-foreground/70 mt-1 text-[11px] leading-snug'>
              {count.note}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/** A single conversion row (label → percentage). */
function ConversionRow(props: {
  label: string
  value: string
  muted: boolean
}) {
  return (
    <div className='flex items-center justify-between gap-3 py-1.5'>
      <span className='text-muted-foreground text-sm'>{props.label}</span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          props.muted && 'text-muted-foreground font-normal'
        )}
      >
        {props.value}
      </span>
    </div>
  )
}

interface FunnelConversionsProps {
  data: AcquisitionFunnelResult
  loading: boolean
}

/**
 * Backend-provided conversion rates. Values are never recomputed here; null
 * rates (e.g. zero denominators or disabled consume logs) render Unavailable.
 */
export function FunnelConversions(props: FunnelConversionsProps) {
  const { t } = useTranslation()
  const rows = [
    {
      label: t('Landing → signup conversion'),
      rate: props.data.landing_to_signup,
    },
    {
      label: t('Signup → first call conversion'),
      rate: props.data.signup_to_first_call,
    },
  ]

  return (
    <div className='bg-card rounded-lg border p-3'>
      <h3 className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
        <HugeiconsIcon
          icon={CONVERSIONS_ICON}
          className='size-3.5 shrink-0'
          aria-hidden='true'
        />
        {t('Conversion rates')}
      </h3>
      <div className='divide-border mt-1 divide-y'>
        {props.loading
          ? rows.map((row) => (
              <div key={row.label} className='py-2'>
                <Skeleton className='h-5 w-40' />
              </div>
            ))
          : rows.map((row) => (
              <ConversionRow
                key={row.label}
                label={row.label}
                value={formatFunnelRate(row.rate)}
                muted={row.rate == null}
              />
            ))}
      </div>
    </div>
  )
}

interface FunnelCoverageProps {
  data: AcquisitionFunnelResult
}

/**
 * Coverage, data-source completeness, echoed filters and the static privacy
 * note. Everything here describes the scope and honesty of the current
 * result — it never shows user-level data.
 */
export function FunnelCoverage(props: FunnelCoverageProps) {
  const { t } = useTranslation()
  const data = props.data
  const completeness: {
    label: string
    status: AcquisitionCompleteness
  }[] = [
    { label: t('Touches'), status: data.data_completeness.touches },
    { label: t('Tokens'), status: data.data_completeness.tokens },
    { label: t('Consume logs'), status: data.data_completeness.consume_logs },
  ]
  return (
    <div className='bg-card space-y-3 rounded-lg border p-3 text-sm'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <HugeiconsIcon
          icon={COVERAGE_ICON}
          className='text-muted-foreground size-3.5 shrink-0'
          aria-hidden='true'
        />
        <span className='text-muted-foreground'>
          {t('Attribution coverage started')}:
        </span>
        <span className='text-foreground font-medium tabular-nums'>
          {formatCoverageTimestamp(data.coverage_started_at)} (UTC)
        </span>
      </div>
      {data.from_before_coverage && (
        <div className='border-warning/40 bg-warning/10 text-warning flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-relaxed'>
          <HugeiconsIcon
            icon={EarthIcon}
            className='mt-0.5 size-3.5 shrink-0'
            aria-hidden='true'
          />
          <span>
            {t(
              'The selected range starts before attribution coverage began; results are not complete history.'
            )}
          </span>
        </div>
      )}
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <span className='text-muted-foreground'>{t('Data completeness')}:</span>
        {completeness.map((item) => {
          const style = getCompletenessStyle(item.status)
          return (
            <Badge
              key={item.label}
              variant='outline'
              className={style.className}
            >
              {item.label}: {t(style.labelKey)}
            </Badge>
          )
        })}
      </div>
      {!data.consume_logs_enabled && (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Consume logs are disabled, so "First successful API calls" is unavailable.'
          )}
        </p>
      )}
      {!data.historical_backfill_available && (
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Historical data has not been backfilled; only data since coverage began exists.'
          )}
        </p>
      )}
      <EchoedFilters data={data} />
      <p className='border-border border-t pt-2 text-xs leading-relaxed'>
        {t(
          'This page shows aggregate metrics only — no user identities or request contents.'
        )}
      </p>
    </div>
  )
}

function EchoedFilters(props: { data: AcquisitionFunnelResult }) {
  const { t } = useTranslation()
  const chips = getEchoedFilterChips(props.data.filters)

  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
      <span className='text-muted-foreground'>{t('Filters')}:</span>
      {chips.length > 0 ? (
        chips.map((chip) => (
          <Badge key={chip.labelKey} variant='secondary' className='max-w-full'>
            <span className='truncate'>
              {t(chip.labelKey)}: {chip.value}
            </span>
          </Badge>
        ))
      ) : (
        <span className='text-muted-foreground text-xs'>
          {t('All sources, all campaigns, all models')}
        </span>
      )}
    </div>
  )
}
