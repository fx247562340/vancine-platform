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
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  SEEDANCE_CTA_EVENT,
  SEEDANCE_CTA_LOCATIONS,
  SEEDANCE_RESOURCE_EVENT,
  SEEDANCE_RESOURCE_VALUES,
  SEEDANCE_RESOURCE_LOCATIONS,
  SEEDANCE_FAQ,
  VANCINE_SEEDANCE_DOCS_URL,
  getSeedanceCtaDestination,
} from '../lib/landing'

interface ContentSectionsProps {
  isAuthenticated: boolean
}

interface UseCase {
  titleKey: string
  descKey: string
  icon: string
}

const USE_CASES: UseCase[] = [
  {
    titleKey: 'AI video applications',
    descKey:
      'Build short- and long-form video from text or images for apps and platforms.',
    icon: '🎬',
  },
  {
    titleKey: 'creative automation',
    descKey:
      'Automate repetitive creative tasks such as image, audio, and video production.',
    icon: '⚙️',
  },
  {
    titleKey: 'content production workflows',
    descKey:
      'Integrate video generation into media, marketing, and entertainment workflows.',
    icon: '🎞️',
  },
  {
    titleKey: 'developer tools and agents',
    descKey:
      'Power developer tools and agents that chain text, image, video, and audio tasks.',
    icon: '🛠️',
  },
]

interface Simplify {
  titleKey: string
  descKey: string
}

const SIMPLIFIES: Simplify[] = [
  {
    titleKey: 'one API key',
    descKey: 'Use one key for supported video workflows.',
  },
  {
    titleKey: 'one balance',
    descKey: 'A single balance covers supported usage.',
  },
  {
    titleKey: 'documented async endpoints',
    descKey: 'Submit and poll through documented async endpoints.',
  },
  {
    titleKey: 'centralized usage logs',
    descKey: 'Inspect usage in one place.',
  },
]

function UseCases() {
  const { t } = useTranslation()
  return (
    <section className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='text-foreground text-center text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Built for Real Video Products')}
        </h2>
        <div className='mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2'>
          {USE_CASES.map((u) => (
            <Card key={u.titleKey}>
              <CardHeader className='flex-row items-center gap-3'>
                <span className='text-2xl' aria-hidden='true'>
                  {u.icon}
                </span>
                <CardTitle className='text-lg'>{t(u.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className='text-sm leading-relaxed'>
                  {t(u.descKey)}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function Trust() {
  const { t } = useTranslation()
  return (
    <section className='bg-muted/30 px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='text-foreground text-center text-3xl font-bold tracking-tight md:text-4xl'>
          {t('What Vancine Simplifies')}
        </h2>
        <div className='mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {SIMPLIFIES.map((s) => (
            <Card key={s.titleKey}>
              <CardHeader>
                <CardTitle className='text-lg'>{t(s.titleKey)}</CardTitle>
                <CardDescription className='pt-1 text-sm leading-relaxed'>
                  {t(s.descKey)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className='text-muted-foreground mt-6 text-center text-sm leading-relaxed'>
          {t(
            'Model capabilities, input requirements, availability, and safety behavior still follow their documented requirements.'
          )}
        </p>
      </div>
    </section>
  )
}

function Pricing(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const destination = getSeedanceCtaDestination(props.isAuthenticated)

  return (
    <section id='pricing' className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-2xl text-center'>
        <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Start Testing Before You Add Funds')}
        </h2>
        <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
          {t(
            'Create an account with $1 in free credit, use the Playground or API, and review live pricing before adding funds.'
          )}
        </p>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-10 px-5 font-medium'
            render={<Link to={destination} />}
            onClick={() =>
              trackEvent(SEEDANCE_CTA_EVENT, {
                location: SEEDANCE_CTA_LOCATIONS[1],
              })
            }
          >
            {t('Start Free with $1 Credit')}
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-10 px-5 font-medium'
            render={<Link to='/pricing' />}
          >
            {t('View Live Pricing')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  return (
    <section id='faq' className='bg-muted/30 px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-3xl'>
        <div className='divide-border border-border bg-card divide-y rounded-2xl border'>
          {SEEDANCE_FAQ.map((item, i) => {
            const open = openIndex === i
            const panelId = `seedance-faq-panel-${i}`
            const buttonId = `seedance-faq-button-${i}`
            return (
              <div key={item.questionKey}>
                <h3>
                  <button
                    id={buttonId}
                    type='button'
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(open ? null : i)}
                    className='text-foreground focus-visible:ring-primary flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2'
                  >
                    {t(item.questionKey)}
                    <ChevronDown
                      size={18}
                      className={cn(
                        'text-muted-foreground shrink-0 transition-transform',
                        open && 'rotate-180'
                      )}
                      aria-hidden='true'
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role='region'
                  aria-labelledby={buttonId}
                  hidden={!open}
                  className='text-foreground/80 px-5 pb-4 text-sm leading-relaxed'
                >
                  {t(item.answerKey)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCta(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const destination = getSeedanceCtaDestination(props.isAuthenticated)

  return (
    <section className='px-4 py-20 md:px-6'>
      <div className='from-primary/20 via-accent/10 ring-border mx-auto max-w-3xl rounded-3xl bg-gradient-to-br to-transparent p-8 text-center ring-1 md:p-12'>
        <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Make Your First Seedance Request')}
        </h2>
        <p className='text-foreground/80 mt-3 text-base leading-relaxed'>
          {t(
            'Start with $1 in free credit and use the documented async workflow when you are ready.'
          )}
        </p>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-5 font-medium'
            render={<Link to={destination} />}
            onClick={() =>
              trackEvent(SEEDANCE_CTA_EVENT, {
                location: SEEDANCE_CTA_LOCATIONS[2],
              })
            }
          >
            {t('Start Free with $1 Credit')}
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='h-11 px-5 font-medium'
            render={
              <a
                href={VANCINE_SEEDANCE_DOCS_URL}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() =>
                  trackEvent(SEEDANCE_RESOURCE_EVENT, {
                    resource: SEEDANCE_RESOURCE_VALUES[0],
                    location: SEEDANCE_RESOURCE_LOCATIONS[2],
                  })
                }
              />
            }
          >
            {t('View Documentation')}
          </Button>
        </div>
      </div>
    </section>
  )
}

export function ConversionSections(props: ContentSectionsProps) {
  return (
    <>
      <UseCases />
      <Trust />
      <Pricing isAuthenticated={props.isAuthenticated} />
      <Faq />
      <FinalCta isAuthenticated={props.isAuthenticated} />
    </>
  )
}
