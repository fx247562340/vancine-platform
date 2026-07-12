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
  AI_MEDIA_CTA_EVENT,
  AI_MEDIA_CTA_LOCATIONS,
  getAiMediaCtaDestination,
} from '../lib/landing'

export interface ContentSectionsProps {
  isAuthenticated: boolean
}

const MODEL_BADGES = [
  'Seedance',
  'Seedream',
  'Doubao TTS',
  'Qwen Image',
  'Text Models',
  '3D Generation',
]

interface Category {
  titleKey: string
  descKey: string
  icon: string
}

const CATEGORIES: Category[] = [
  {
    titleKey: 'Video Generation',
    descKey: 'text-to-video and image-to-video async task workflows.',
    icon: '🎬',
  },
  {
    titleKey: 'Image Generation',
    descKey: 'image generation and editing through documented endpoints.',
    icon: '🖼️',
  },
  {
    titleKey: 'Text to Speech',
    descKey: 'binary MP3 output with OpenAI-compatible request shapes.',
    icon: '🔊',
  },
  {
    titleKey: 'Text Models',
    descKey: 'OpenAI-compatible chat and reasoning workflows.',
    icon: '💬',
  },
  {
    titleKey: '3D Generation',
    descKey: 'text- or image-guided async asset generation.',
    icon: '🧊',
  },
]

interface UseCase {
  titleKey: string
  descKey: string
}

const USE_CASES: UseCase[] = [
  {
    titleKey: 'AI Video Platforms',
    descKey: 'Generate short- and long-form video from text or images.',
  },
  {
    titleKey: 'Creative Automation Tools',
    descKey:
      'Automate image, audio, and video production for creative pipelines.',
  },
  {
    titleKey: 'AI SaaS Products',
    descKey:
      'Add media generation to an existing product through one integration.',
  },
  {
    titleKey: 'Developer Tools and Agents',
    descKey:
      'Build agents and tools that chain text, image, video, and audio tasks.',
  },
]

interface FaqItem {
  questionKey: string
  answerKey: string
}

const FAQ_ITEMS: FaqItem[] = [
  {
    questionKey: 'Is Vancine OpenAI compatible?',
    answerKey:
      'For supported text and speech workflows, Vancine offers OpenAI-compatible request shapes. For video, image, and 3D capabilities, use the documented media endpoints.',
  },
  {
    questionKey: 'Which models can I access?',
    answerKey:
      'You can use the video, image, speech, text, and 3D models currently supported by the platform. See the live pricing page and API documentation for current availability.',
  },
  {
    questionKey: 'How does video generation work?',
    answerKey:
      'Video generation uses an async task workflow: submit a generation request, receive a task ID, then poll the task status and retrieve the result.',
  },
  {
    questionKey: 'Do I need a credit card to start?',
    answerKey:
      'No. After signing up you receive $1 in free credits with no credit card required to begin testing.',
  },
  {
    questionKey: 'Where can I see pricing?',
    answerKey:
      'See the live pricing page. Model pricing can change, so this landing page does not hard-code specific prices.',
  },
  {
    questionKey: 'Can I test models before integrating?',
    answerKey:
      'Yes. After signing you can test supported models in the Playground before writing any integration code.',
  },
]

function CapabilityStrip() {
  const { t } = useTranslation()
  return (
    <section className='bg-muted/40 px-4 py-8 md:px-6'>
      <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3'>
        {MODEL_BADGES.map((label) => (
          <span
            key={label}
            className='text-foreground/80 border-border/60 bg-background rounded-full border px-3 py-1 text-sm font-medium'
          >
            {label}
          </span>
        ))}
      </div>
      <p className='text-foreground/70 mt-5 text-center text-sm'>
        {t(
          'Video, image, audio, text, and 3D generation—available with one API key.'
        )}
      </p>
    </section>
  )
}

function ProblemSolution() {
  const { t } = useTranslation()
  const cards = [
    {
      titleKey: 'One API Key',
      descKey:
        'Connect once and access supported media and text models from one account.',
    },
    {
      titleKey: 'Unified Billing',
      descKey:
        'Manage one balance instead of separate provider accounts and payment methods.',
    },
    {
      titleKey: 'Consistent Developer Experience',
      descKey:
        'Use documented request patterns, centralized usage logs, and async task workflows.',
    },
  ]
  return (
    <section className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
            {t('Stop Rebuilding the Same Integration')}
          </h2>
          <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
            {t(
              'Every model provider comes with its own authentication, request format, billing system, and operational quirks. Vancine gives your product one consistent integration layer.'
            )}
          </p>
        </div>
        <div className='mt-10 grid grid-cols-1 gap-5 md:grid-cols-3'>
          {cards.map((c) => (
            <Card key={c.titleKey}>
              <CardHeader>
                <CardTitle className='text-lg'>{t(c.titleKey)}</CardTitle>
                <CardDescription className='pt-1 text-sm leading-relaxed'>
                  {t(c.descKey)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function ModelCategories() {
  const { t } = useTranslation()
  return (
    <section className='bg-muted/30 px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
            {t('One Integration Across the AI Media Stack')}
          </h2>
        </div>
        <div className='mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {CATEGORIES.map((c) => (
            <Card key={c.titleKey}>
              <CardHeader className='flex-row items-center gap-3'>
                <span className='text-2xl' aria-hidden='true'>
                  {c.icon}
                </span>
                <CardTitle className='text-lg'>{t(c.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className='text-sm leading-relaxed'>
                  {t(c.descKey)}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className='mt-8 text-center'>
          <Button
            variant='outline'
            className='font-medium'
            render={<Link to='/pricing' />}
          >
            {t('Browse Models and Live Pricing')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  const { t } = useTranslation()
  return (
    <section className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='text-foreground text-center text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Built for Products That Generate More Than Text')}
        </h2>
        <div className='mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2'>
          {USE_CASES.map((u) => (
            <Card key={u.titleKey}>
              <CardHeader>
                <CardTitle className='text-lg'>{t(u.titleKey)}</CardTitle>
                <CardDescription className='pt-1 text-sm leading-relaxed'>
                  {t(u.descKey)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function Comparison() {
  const { t } = useTranslation()
  const rows: Array<[string, string]> = [
    ['Multiple provider accounts', 'One account'],
    ['Different authentication methods', 'One API key'],
    ['Separate balances', 'Unified billing'],
    ['Provider-specific request formats', 'Documented common endpoints'],
    ['Scattered usage records', 'Centralized usage logs'],
    ['Repeated maintenance', 'One integration layer'],
  ]
  return (
    <section className='bg-muted/30 px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-4xl'>
        <h2 className='text-foreground text-center text-3xl font-bold tracking-tight md:text-4xl'>
          {t('One Integration Instead of Many')}
        </h2>
        <div className='border-border bg-card mt-10 overflow-hidden rounded-2xl border'>
          <div className='border-border grid grid-cols-2 border-b text-sm font-semibold'>
            <div className='text-muted-foreground px-4 py-3'>
              {t('Direct integrations')}
            </div>
            <div className='border-border text-muted-foreground border-l px-4 py-3'>
              {t('Vancine')}
            </div>
          </div>
          {rows.map(([left, right], i) => (
            <div
              key={left}
              className={cn(
                'grid grid-cols-2 text-sm',
                i % 2 === 1 && 'bg-muted/40'
              )}
            >
              <div className='text-foreground/80 px-4 py-3'>{t(left)}</div>
              <div className='border-border text-foreground border-l px-4 py-3 font-medium'>
                {t(right)}
              </div>
            </div>
          ))}
        </div>
        <p className='text-muted-foreground mt-5 text-center text-sm leading-relaxed'>
          {t(
            'Model-specific capabilities still follow their documented requirements. Vancine simplifies access without hiding important model differences.'
          )}
        </p>
      </div>
    </section>
  )
}

function Pricing(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const destination = getAiMediaCtaDestination(props.isAuthenticated)
  const facts = [
    '$1 free credit',
    'No credit card required',
    'Public model pricing',
    'Pay only for actual usage',
  ]
  return (
    <section id='pricing' className='px-4 py-16 md:px-6'>
      <div className='mx-auto max-w-2xl text-center'>
        <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Start Building Before You Commit')}
        </h2>
        <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
          {t(
            'Create an account and receive $1 in free credits. Explore supported models, test requests in the Playground, and review public pricing before adding funds.'
          )}
        </p>
        <div className='mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2'>
          {facts.map((f) => (
            <span key={f} className='text-foreground/80 text-sm font-medium'>
              {t(f)}
            </span>
          ))}
        </div>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-10 px-5 font-medium'
            render={<Link to={destination} />}
            onClick={() =>
              trackEvent(AI_MEDIA_CTA_EVENT, {
                location: AI_MEDIA_CTA_LOCATIONS[1],
              })
            }
          >
            {t('Start Free')}
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
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i
            const panelId = `faq-panel-${i}`
            const buttonId = `faq-button-${i}`
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
  const destination = getAiMediaCtaDestination(props.isAuthenticated)
  return (
    <section className='px-4 py-20 md:px-6'>
      <div className='from-primary/20 via-accent/10 ring-border mx-auto max-w-3xl rounded-3xl bg-gradient-to-br to-transparent p-8 text-center ring-1 md:p-12'>
        <h2 className='text-foreground text-3xl font-bold tracking-tight md:text-4xl'>
          {t('Build Your First AI Media Request Today')}
        </h2>
        <p className='text-foreground/80 mt-3 text-base leading-relaxed'>
          {t(
            'Create your account, claim $1 in free credits, and test supported models in the Playground.'
          )}
        </p>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-11 px-5 font-medium'
            render={<Link to={destination} />}
            onClick={() =>
              trackEvent(AI_MEDIA_CTA_EVENT, {
                location: AI_MEDIA_CTA_LOCATIONS[2],
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
                href='https://vancine.com/docs'
                target='_blank'
                rel='noopener noreferrer'
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

export function ContentSections(props: ContentSectionsProps) {
  return (
    <>
      <CapabilityStrip />
      <ProblemSolution />
      <ModelCategories />
      <UseCases />
      <Comparison />
      <Pricing isAuthenticated={props.isAuthenticated} />
      <Faq />
      <FinalCta isAuthenticated={props.isAuthenticated} />
    </>
  )
}
