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
  CloudLightningIcon,
  Download04Icon,
  SendToMobileIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { trackEvent } from '@/lib/analytics'

import { SEEDANCE_RESOURCE_EVENT } from '../lib/landing'

interface WorkflowStep {
  icon: typeof CloudLightningIcon
  titleKey: string
  descriptionKey: string
}

const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    icon: SendToMobileIcon,
    titleKey: 'Submit',
    descriptionKey:
      'Send a generation request with your prompt. Vancine returns a task id.',
  },
  {
    icon: CloudLightningIcon,
    titleKey: 'Poll',
    descriptionKey:
      'Poll the task status by task id until it reaches a terminal state. Completion time varies by task and load.',
  },
  {
    icon: Download04Icon,
    titleKey: 'Result',
    descriptionKey:
      'Retrieve the video URL on success, or the error details on failure.',
  },
]

/**
 * Explains the submit -> poll -> result async workflow. Each step is a plain
 * explanation card; no live demo, no latency numbers, no fixed promises.
 */
export function AsyncWorkflow(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='seedance-workflow-title'
      className='mx-auto w-full max-w-4xl px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2 text-center'>
        <h2
          id='seedance-workflow-title'
          className='text-3xl font-bold md:text-4xl'
        >
          {t('How async video generation works')}
        </h2>
        <p className='text-muted-foreground mx-auto max-w-2xl'>
          {t('Seedance 2.5 async task workflow')}
        </p>
        <p className='text-muted-foreground mx-auto max-w-2xl text-sm'>
          {t(
            'Three steps: submit the task, poll until it reaches a terminal state, then retrieve the video or the error.'
          )}
        </p>
      </div>
      <div className='mt-10 grid gap-6 md:grid-cols-3'>
        {WORKFLOW_STEPS.map((step) => (
          <div
            key={step.titleKey}
            className='border-border bg-muted/30 flex flex-col items-center gap-3 rounded-xl border p-6 text-center'
          >
            <HugeiconsIcon
              icon={step.icon}
              className='text-primary size-8'
              aria-hidden='true'
            />
            <h3 className='text-lg font-semibold'>{t(step.titleKey)}</h3>
            <p className='text-muted-foreground text-sm'>
              {t(step.descriptionKey)}
            </p>
          </div>
        ))}
      </div>
      <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
        <Link
          to='/docs/$slug'
          params={{ slug: 'video' }}
          className='text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
          onClick={() =>
            trackEvent(SEEDANCE_RESOURCE_EVENT, {
              resource: 'docs',
              location: 'async_workflow',
            })
          }
        >
          {t('Read API documentation')}
        </Link>
        <Link
          to='/pricing'
          className='text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
          onClick={() =>
            trackEvent(SEEDANCE_RESOURCE_EVENT, {
              resource: 'pricing',
              location: 'async_workflow',
            })
          }
        >
          {t('View live pricing and availability')}
        </Link>
      </div>
    </section>
  )
}
