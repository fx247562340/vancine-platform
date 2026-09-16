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
import { AlertCircleIcon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Loading skeleton matching the metrics + conversions + coverage layout. */
export function FunnelSkeleton() {
  return (
    <div className='space-y-3' aria-busy='true'>
      <div className='grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5'>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className='bg-card rounded-lg border p-3'>
            <Skeleton className='h-3.5 w-20' />
            <Skeleton className='mt-2 h-7 w-16' />
            <Skeleton className='mt-2 h-3 w-28' />
          </div>
        ))}
      </div>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <div className='bg-card rounded-lg border p-3'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='mt-2 h-5 w-56' />
          <Skeleton className='mt-2 h-5 w-48' />
        </div>
        <div className='bg-card rounded-lg border p-3'>
          <Skeleton className='h-4 w-40' />
          <Skeleton className='mt-2 h-4 w-64' />
          <Skeleton className='mt-2 h-4 w-56' />
        </div>
      </div>
    </div>
  )
}

interface FunnelErrorProps {
  /** Re-run the currently committed query exactly once. */
  onRetry: () => void
}

/** Query failure state with a single-query Retry action. */
export function FunnelError(props: FunnelErrorProps) {
  const { t } = useTranslation()
  return (
    <div
      role='alert'
      className='border-destructive/30 bg-destructive/5 flex flex-col items-start gap-2 rounded-lg border p-4'
    >
      <div className='text-destructive flex items-center gap-2 text-sm font-medium'>
        <HugeiconsIcon
          icon={AlertCircleIcon}
          className='size-4 shrink-0'
          aria-hidden='true'
        />
        {t('Failed to load the acquisition funnel')}
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t(
          'The server did not return funnel data. You can retry the current query.'
        )}
      </p>
      <Button type='button' variant='outline' size='sm' onClick={props.onRetry}>
        <HugeiconsIcon
          icon={RefreshIcon}
          className='size-3.5'
          aria-hidden='true'
        />
        {t('Retry')}
      </Button>
    </div>
  )
}
