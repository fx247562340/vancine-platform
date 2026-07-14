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
import { useTranslation } from 'react-i18next'

interface Step {
  titleKey: string
  descKey: string
  icon: string
}

const STEPS: Step[] = [
  {
    titleKey: 'Submit a generation task',
    descKey:
      'Use the documented submit endpoint to start a video generation task.',
    icon: '①',
  },
  {
    titleKey: 'Save the task ID',
    descKey: 'The response includes a unique task_id you save for polling.',
    icon: '②',
  },
  {
    titleKey: 'Poll the status',
    descKey:
      'Poll the documented status endpoint until it returns a terminal state.',
    icon: '③',
  },
  {
    titleKey: 'Retrieve the result',
    descKey:
      'Read the result URL from the terminal response to retrieve the generated video.',
    icon: '④',
  },
]

export function WorkflowSection() {
  const { t } = useTranslation()
  return (
    <section id='workflow' className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
            {t('From Prompt to Video in One Async Workflow')}
          </h2>
        </div>
        <div className='mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {STEPS.map((step) => (
            <div
              key={step.titleKey}
              className='bg-card ring-border/50 rounded-2xl border p-6 ring-1'
            >
              <div className='text-primary text-2xl font-bold'>{step.icon}</div>
              <h3 className='text-foreground mt-3 text-base font-semibold'>
                {t(step.titleKey)}
              </h3>
              <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                {t(step.descKey)}
              </p>
            </div>
          ))}
        </div>
        <p className='text-muted-foreground mt-6 text-center text-sm leading-relaxed'>
          {t(
            'Current documented examples include Doubao-Seedance-1.5-pro, Doubao-Seedance-2.0-fast, and Doubao-Seedance-2.0. Live documentation and pricing remain authoritative.'
          )}
        </p>
      </div>
    </section>
  )
}
