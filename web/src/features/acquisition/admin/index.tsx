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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'

import { FunnelFiltersPanel } from './components/funnel-filters-panel'
import {
  FunnelConversions,
  FunnelCoverage,
  FunnelMetricsGrid,
} from './components/funnel-metrics'
import { FunnelError, FunnelSkeleton } from './components/funnel-status'
import { useFunnelQuery } from './hooks/use-funnel-query'
import { buildFunnelFormDefaults } from './lib'
import type { AcquisitionFunnelFormValues } from './types'

/**
 * Admin-only acquisition funnel page (route /acquisition-funnel). The route's
 * beforeLoad guard already blocks non-admin users before any API request; this
 * component only renders for ROLE.ADMIN and above.
 */
export function AcquisitionFunnelPage() {
  const { t } = useTranslation()
  const query = useFunnelQuery()

  const handleApply = useCallback(
    (values: AcquisitionFunnelFormValues) => {
      query.applyFilters(values)
    },
    [query]
  )

  const handleReset = useCallback(() => {
    query.applyFilters(buildFunnelFormDefaults())
  }, [query])

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Acquisition Funnel')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{t('Admin only')}</Badge>
            <span className='text-muted-foreground text-xs'>
              {t('All dates on this page are UTC dates.')}
            </span>
          </div>

          <div className='bg-card rounded-lg border p-3'>
            <FunnelFiltersPanel
              appliedFilters={query.appliedFilters}
              onApply={handleApply}
              onReset={handleReset}
            />
          </div>

          {query.isLoading && <FunnelSkeleton />}
          {!query.isLoading && query.isError && (
            <FunnelError onRetry={query.refetch} />
          )}
          {!query.isLoading && !query.isError && query.data && (
            <div className='space-y-3'>
              <FunnelMetricsGrid data={query.data} loading={false} />
              <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
                <FunnelConversions data={query.data} loading={false} />
                <FunnelCoverage data={query.data} />
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(
                  'This API provides no revenue, top-up or paid-conversion metrics.'
                )}
              </p>
            </div>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
