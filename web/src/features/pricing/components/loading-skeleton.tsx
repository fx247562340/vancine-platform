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
import { Skeleton } from '@/components/ui/skeleton'

import { VIEW_MODES, type ViewMode } from '../constants'

const CARD_SKELETON_KEYS = [
  'card-skeleton-slot-01',
  'card-skeleton-slot-02',
  'card-skeleton-slot-03',
  'card-skeleton-slot-04',
  'card-skeleton-slot-05',
  'card-skeleton-slot-06',
  'card-skeleton-slot-07',
  'card-skeleton-slot-08',
  'card-skeleton-slot-09',
] as const

const FILTER_SKELETON_SLOTS = [
  { key: 'filter-skeleton-slot-01', width: 80 },
  { key: 'filter-skeleton-slot-02', width: 90 },
  { key: 'filter-skeleton-slot-03', width: 75 },
  { key: 'filter-skeleton-slot-04', width: 85 },
  { key: 'filter-skeleton-slot-05', width: 70 },
] as const

const TABLE_COLUMN_SKELETONS = [
  { key: 'table-column-skeleton-slot-01', width: 200 },
  { key: 'table-column-skeleton-slot-02', width: 100 },
  { key: 'table-column-skeleton-slot-03', width: 100 },
  { key: 'table-column-skeleton-slot-04', width: 100 },
  { key: 'table-column-skeleton-slot-05', width: 80 },
  { key: 'table-column-skeleton-slot-06', width: 100 },
] as const

const TABLE_ROW_SKELETON_KEYS = [
  'table-row-skeleton-slot-01',
  'table-row-skeleton-slot-02',
  'table-row-skeleton-slot-03',
  'table-row-skeleton-slot-04',
  'table-row-skeleton-slot-05',
  'table-row-skeleton-slot-06',
  'table-row-skeleton-slot-07',
  'table-row-skeleton-slot-08',
  'table-row-skeleton-slot-09',
  'table-row-skeleton-slot-10',
] as const

const PAGINATION_SKELETON_KEYS = [
  'pagination-skeleton-slot-01',
  'pagination-skeleton-slot-02',
  'pagination-skeleton-slot-03',
  'pagination-skeleton-slot-04',
] as const

export interface LoadingSkeletonProps {
  viewMode?: ViewMode
}

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  const viewMode = props.viewMode ?? VIEW_MODES.CARD

  return (
    <div className='space-y-5'>
      <div className='space-y-1.5'>
        <Skeleton className='h-8 w-40' />
        <Skeleton className='h-4 w-52' />
      </div>
      <Skeleton className='h-10 w-full rounded-lg' />
      <FilterBarSkeleton />
      {viewMode === VIEW_MODES.TABLE ? (
        <TableContentSkeleton />
      ) : (
        <CardContentSkeleton />
      )}
    </div>
  )
}

function CardContentSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {CARD_SKELETON_KEYS.map((slotKey) => (
        <div key={slotKey} className='rounded-xl border p-5'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex min-w-0 items-start gap-3'>
              <Skeleton className='size-10 shrink-0 rounded-xl' />
              <div className='min-w-0 flex-1 space-y-2'>
                <Skeleton className='h-5 w-36' />
                <Skeleton className='h-3.5 w-48' />
              </div>
            </div>
            <Skeleton className='h-8 w-16 rounded-md' />
          </div>
          <div className='mt-4 space-y-2'>
            <Skeleton className='h-3.5 w-full' />
            <Skeleton className='h-3.5 w-4/5' />
          </div>
          <div className='mt-4 flex items-center gap-2'>
            <Skeleton className='h-4 w-24' />
            <Skeleton className='h-4 w-16' />
          </div>
          <div className='mt-2 flex items-center gap-3'>
            <Skeleton className='h-3.5 w-14' />
            <Skeleton className='h-3.5 w-14' />
            <Skeleton className='h-3.5 w-8' />
          </div>
        </div>
      ))}
    </div>
  )
}

function FilterBarSkeleton() {
  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-3'>
        <div className='flex flex-1 flex-wrap items-center gap-2'>
          {FILTER_SKELETON_SLOTS.map((slot) => (
            <Skeleton
              key={slot.key}
              className='h-8 rounded-lg'
              style={{ width: `${slot.width}px` }}
            />
          ))}
        </div>
        <div className='flex items-center gap-2'>
          <Skeleton className='h-8 w-24 rounded-lg' />
          <Skeleton className='h-8 w-20 rounded-lg' />
          <Skeleton className='h-8 w-24' />
          <Skeleton className='h-8 w-20 rounded-lg' />
        </div>
      </div>
      <Skeleton className='h-5 w-24' />
    </div>
  )
}

function TableContentSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='overflow-hidden rounded-lg border'>
        <div className='bg-muted/30 border-b px-4 py-3'>
          <div className='flex items-center gap-4'>
            {TABLE_COLUMN_SKELETONS.map((col) => (
              <Skeleton
                key={col.key}
                className='h-4'
                style={{ width: `${col.width}px` }}
              />
            ))}
          </div>
        </div>
        {TABLE_ROW_SKELETON_KEYS.map((rowKey) => (
          <div
            key={rowKey}
            className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
          >
            {TABLE_COLUMN_SKELETONS.map((col) => (
              <Skeleton
                key={col.key}
                className='h-5'
                style={{ width: `${col.width}px` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className='flex items-center justify-between'>
        <Skeleton className='h-5 w-32' />
        <div className='flex items-center gap-2'>
          {PAGINATION_SKELETON_KEYS.map((slotKey) => (
            <Skeleton key={slotKey} className='size-8' />
          ))}
        </div>
      </div>
    </div>
  )
}
