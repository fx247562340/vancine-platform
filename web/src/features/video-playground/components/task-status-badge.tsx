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

For commercial licensing, please contact support@quantumnous.com.
*/
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import { VIDEO_TASK_FAILURE, VIDEO_TASK_SUCCESS } from '../constants'
import type { SubmissionStatus } from '../hooks/use-submission'

export type TaskStatusBadgeProps = {
  status: SubmissionStatus
  queryStatus: string | undefined
  isPending: boolean
}

/**
 * Six canonical labels — no seventh "Pending" fallback. Mapping:
 *   submitting          → Submitting
 *   pending             → Queued
 *   cancelled           → Cancelled
 *   failed (submit)     → Failed
 *   queryStatus SUCCESS → Completed
 *   queryStatus FAILURE → Failed
 *   submitStatus polling + !terminal → Running
 * The polling branch wins even on a query error: a transient 503 must
 * not surface as Failed, and a still-fetching first call must not
 * hide Running. The caller's own error surface carries the query
 * error; the badge keeps the polling semantic.
 */
export function TaskStatusBadge(props: TaskStatusBadgeProps) {
  const { t } = useTranslation()
  if (props.status === 'submitting') {
    return (
      <Badge variant='secondary' className='gap-1'>
        <HugeiconsIcon
          icon={Loading03Icon}
          aria-hidden
          data-icon='inline-start'
          className='animate-spin'
        />
        {t('Submitting')}
      </Badge>
    )
  }
  if (props.status === 'cancelled') {
    return (
      <Badge variant='outline' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Cancelled')}
      </Badge>
    )
  }
  if (props.status === 'failed') {
    return (
      <Badge variant='destructive' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Failed')}
      </Badge>
    )
  }
  if (props.status === 'pending') {
    return (
      <Badge variant='outline' className='gap-1'>
        {t('Queued')}
      </Badge>
    )
  }
  if (props.queryStatus === VIDEO_TASK_SUCCESS) {
    return (
      <Badge variant='default' className='gap-1'>
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Completed')}
      </Badge>
    )
  }
  if (props.queryStatus === VIDEO_TASK_FAILURE) {
    return (
      <Badge variant='destructive' className='gap-1'>
        <HugeiconsIcon
          icon={Cancel01Icon}
          aria-hidden
          data-icon='inline-start'
        />
        {t('Failed')}
      </Badge>
    )
  }
  // submitStatus is 'polling' (or any other unhandled case where the
  // task is neither terminal nor locally failed/cancelled/submitting).
  if (props.isPending || props.status === 'polling') {
    return (
      <Badge variant='secondary' className='gap-1'>
        <HugeiconsIcon
          icon={Loading03Icon}
          aria-hidden
          data-icon='inline-start'
          className='animate-spin'
        />
        {t('Running')}
      </Badge>
    )
  }
  return null
}
