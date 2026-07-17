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
import { useCallback, useId, useRef, useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import {
  SEEDANCE_CODE_EXAMPLES,
  getSeedanceDocsUrl,
  getSeedancePostmanUrl,
  SEEDANCE_POSTMAN_TRACKING,
  SEEDANCE_RESOURCE_EVENT,
  SEEDANCE_RESOURCE_VALUES,
  SEEDANCE_RESOURCE_LOCATIONS,
  type SeedanceCodeExample,
} from '../lib/landing'

type CopyStatus = 'idle' | 'copied' | 'error'

function CodePanel(props: { example: SeedanceCodeExample }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<CopyStatus>('idle')
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const descriptionId = useId()

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(props.example.code)
      setStatus('copied')
    } catch {
      setStatus('error')
    } finally {
      if (statusTimer.current) clearTimeout(statusTimer.current)
      statusTimer.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }, [props.example.code])

  const announce =
    status === 'copied'
      ? t('Code copied')
      : status === 'error'
        ? t('Unable to copy code')
        : ''

  return (
    <div className='bg-card ring-border/50 overflow-hidden rounded-2xl border ring-1'>
      <div className='border-border/50 flex items-center justify-between border-b px-4 py-2.5'>
        <a
          href={getSeedanceDocsUrl()}
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary text-xs font-medium hover:underline'
          onClick={() =>
            trackEvent(SEEDANCE_RESOURCE_EVENT, {
              resource: SEEDANCE_RESOURCE_VALUES[0],
              location: SEEDANCE_RESOURCE_LOCATIONS[1],
            })
          }
        >
          {t('Read API Documentation')}
        </a>
        <button
          type='button'
          onClick={handleCopy}
          aria-label={t('Copy example code to clipboard')}
          aria-describedby={descriptionId}
          className={cn(
            'text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            status === 'copied' && 'text-emerald-500',
            status === 'error' && 'text-destructive'
          )}
        >
          {status === 'copied' ? (
            <Check size={14} aria-hidden='true' />
          ) : (
            <Copy size={14} aria-hidden='true' />
          )}
          {status === 'copied'
            ? t('Code copied')
            : status === 'error'
              ? t('Unable to copy code')
              : t('Copy code')}
        </button>
      </div>
      <pre
        className='overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed'
        tabIndex={0}
      >
        <code className='text-foreground/90'>{props.example.code}</code>
      </pre>
      <p id={descriptionId} className='sr-only' aria-live='polite'>
        {announce}
      </p>
    </div>
  )
}

function PostmanResourceCard() {
  const { t } = useTranslation()

  // One click -> exactly one analytics event. The payload comes from the
  // shared landing contract so it cannot drift from the allowed values.
  const handleClick = useCallback(() => {
    trackEvent(SEEDANCE_POSTMAN_TRACKING.event, {
      resource: SEEDANCE_POSTMAN_TRACKING.resource,
      location: SEEDANCE_POSTMAN_TRACKING.location,
    })
  }, [])

  return (
    <div className='bg-card border-border mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-between gap-4 rounded-xl border p-4'>
      <p className='text-muted-foreground min-w-0 flex-[1_1_280px] text-[13px] leading-relaxed break-words'>
        {t(
          'Use the verified collection to submit Seedance jobs and poll results. Add your real API key only in your private fork or local variable.'
        )}
      </p>
      <a
        href={getSeedancePostmanUrl()}
        target='_blank'
        rel='noopener noreferrer'
        onClick={handleClick}
        className='bg-primary text-primary-foreground focus-visible:ring-primary inline-flex min-w-0 flex-[1_1_160px] items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-center text-[13px] font-semibold break-words transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
      >
        <ExternalLink size={14} aria-hidden='true' />
        {t('Run the Seedance Collection in Postman')}
      </a>
    </div>
  )
}

export function CodeExamplesSection() {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<SeedanceCodeExample['id']>('curl')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeExample =
    SEEDANCE_CODE_EXAMPLES.find((e) => e.id === activeId) ??
    SEEDANCE_CODE_EXAMPLES[0]

  const focusTab = (index: number) => {
    const clamped =
      (index + SEEDANCE_CODE_EXAMPLES.length) % SEEDANCE_CODE_EXAMPLES.length
    setActiveId(SEEDANCE_CODE_EXAMPLES[clamped].id)
    tabRefs.current[clamped]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        focusTab(index + 1)
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusTab(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusTab(0)
        break
      case 'End':
        event.preventDefault()
        focusTab(SEEDANCE_CODE_EXAMPLES.length - 1)
        break
    }
  }

  return (
    <section id='api' className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
            {t('Copy a Complete Seedance Request')}
          </h2>
          <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
            {t(
              'Choose cURL, Python, or Node.js. Each example submits the task, handles errors, polls with a fixed limit, and prints the result URL.'
            )}
          </p>
        </div>

        <PostmanResourceCard />

        <div className='mt-10'>
          <div
            role='tablist'
            aria-label={t('API examples')}
            className='border-border bg-muted/40 mx-auto flex w-full max-w-md gap-1 rounded-xl border p-1'
          >
            {SEEDANCE_CODE_EXAMPLES.map((example, index) => {
              const selected = example.id === activeId
              return (
                <button
                  key={example.id}
                  ref={(el) => {
                    tabRefs.current[index] = el
                  }}
                  role='tab'
                  type='button'
                  aria-selected={selected}
                  aria-controls={`seedance-panel-${example.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => focusTab(index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className={cn(
                    'focus-visible:ring-primary min-w-0 flex-1 rounded-lg px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 sm:px-3',
                    selected
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                    selected && `[aria-selected='true']`
                  )}
                >
                  {t(example.labelKey)}
                </button>
              )
            })}
          </div>

          <div
            id={`seedance-panel-${activeId}`}
            role='tabpanel'
            className='mt-5'
          >
            <CodePanel example={activeExample} />
          </div>
        </div>
      </div>
    </section>
  )
}
