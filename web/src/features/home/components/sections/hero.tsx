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
import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { trackEvent } from '@/lib/analytics'

import type { HomepagePricingState } from '../../lib/homepage-pricing'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
  pricing?: HomepagePricingState
}

// Stylized three-dots indicator representing "More"
const MoreIcon = () => (
  <svg
    className='text-muted-foreground/60 group-hover:text-foreground size-[18px] shrink-0 transition-colors'
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
  >
    <circle cx='6' cy='12' r='2' fill='currentColor' />
    <circle cx='12' cy='12' r='2' fill='currentColor' />
    <circle cx='18' cy='12' r='2' fill='currentColor' />
  </svg>
)

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl = (status?.docs_link as string | undefined)?.trim() || ''
  const modelCount =
    props.pricing?.status === 'ready' &&
    typeof props.pricing.count === 'number' &&
    props.pricing.count >= 1
      ? props.pricing.count
      : null
  const hasModelCount = modelCount !== null

  const renderDocsButton = () => {
    if (!docsUrl) return null
    const isExternal = docsUrl.startsWith('http')
    if (isExternal) {
      return (
        <Button
          variant='ghost'
          className='text-muted-foreground hover:text-foreground inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='size-4' />
          <span>{t('Documentation')}</span>
        </Button>
      )
    }
    return (
      <Button
        variant='ghost'
        className='text-muted-foreground hover:text-foreground inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='size-4' />
        <span>{t('Documentation')}</span>
      </Button>
    )
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-36 lg:pb-28'>
      {/* Radial gradient background */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.12]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 40% 80%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
      {/* Grid pattern */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.08]'
      />

      <div className='mx-auto max-w-6xl'>
        <div
          data-testid='hero-primary-grid'
          className='grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:items-stretch lg:gap-10'
        >
          {/* The copy and terminal share the same desktop height. This keeps
              both baselines intentional even when translated copy wraps. */}
          <div
            data-testid='hero-copy-panel'
            className='flex min-w-0 flex-col items-start text-left lg:col-span-6 lg:min-h-[528px]'
          >
            <div className='min-w-0'>
              <div
                className='landing-animate-fade-up mb-5 inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-[11px] font-medium text-blue-600 opacity-0 shadow-xs dark:border-blue-400/20 dark:bg-blue-400/5 dark:text-blue-400'
                style={{ animationDelay: '0ms' }}
              >
                <span className='relative flex size-1.5'>
                  <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75' />
                  <span className='relative inline-flex size-1.5 rounded-full bg-blue-500 dark:bg-blue-400' />
                </span>
                <span>
                  {t(
                    'OpenAI-compatible access to flagship and fast-inference models'
                  )}
                </span>
              </div>

              <h1
                className='landing-animate-fade-up max-w-[20ch] text-[clamp(2.25rem,4.5vw,3.25rem)] leading-[1.12] font-bold tracking-tight opacity-0'
                style={{ animationDelay: '60ms' }}
              >
                {t(
                  'One API for Chinese frontier and high-performance AI models'
                )}
              </h1>
              <p
                className='landing-animate-fade-up text-muted-foreground/80 mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-[15px]'
                style={{ animationDelay: '120ms' }}
              >
                {t(
                  'Access flagship and fast-inference models for reasoning, coding, multimodal workflows, AI agents, and high-throughput applications through one OpenAI-compatible API.'
                )}
              </p>
            </div>

            <div className='mt-8 min-w-0 lg:mt-auto'>
              <div
                className='landing-animate-fade-up flex flex-wrap items-center gap-3 opacity-0'
                style={{ animationDelay: '180ms' }}
              >
                {props.isAuthenticated ? (
                  <>
                    <Button
                      className='group h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/dashboard' />}
                      onClick={() =>
                        trackEvent('get_started_clicked', { location: 'hero' })
                      }
                    >
                      {t('Start building free')}
                      <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                    </Button>
                    <Button
                      variant='outline'
                      className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/pricing' />}
                      onClick={() =>
                        trackEvent('explore_models_clicked', {
                          location: 'hero',
                        })
                      }
                    >
                      {t('View available models')}
                    </Button>
                    {renderDocsButton()}
                  </>
                ) : (
                  <>
                    <Button
                      className='group h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/sign-up' />}
                      onClick={() =>
                        trackEvent('get_started_clicked', { location: 'hero' })
                      }
                    >
                      {t('Start building free')}
                      <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                    </Button>
                    <Button
                      variant='outline'
                      className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
                      render={<Link to='/pricing' />}
                      onClick={() =>
                        trackEvent('explore_models_clicked', {
                          location: 'hero',
                        })
                      }
                    >
                      {t('View available models')}
                    </Button>
                    {renderDocsButton()}
                  </>
                )}
              </div>

              <div
                className='landing-animate-fade-up mt-4 opacity-0'
                style={{ animationDelay: '210ms' }}
              >
                <Link
                  to='/openrouter-alternative'
                  className='text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-4'
                >
                  {t('Compare Vancine with OpenRouter')}
                </Link>
              </div>
            </div>
          </div>

          <div
            data-testid='hero-terminal-panel'
            className='landing-animate-fade-up flex w-full min-w-0 justify-center opacity-0 lg:col-span-6 lg:min-h-[528px]'
            style={{ animationDelay: '280ms' }}
          >
            <HeroTerminalDemo className='mt-8 lg:mt-0' />
          </div>
        </div>

        {/* A three-zone technical rail: context, integration surface, and
            live proof. Each zone starts on the same baseline on desktop. */}
        <div
          data-testid='hero-proof-rail'
          className='landing-animate-fade-up border-border/50 bg-background/35 mt-10 grid min-w-0 gap-6 rounded-2xl border p-5 opacity-0 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.55)] backdrop-blur-sm sm:p-6 lg:grid-cols-12 lg:items-start lg:gap-0 dark:bg-white/[0.015]'
          style={{ animationDelay: '340ms' }}
        >
          <div className='min-w-0 lg:col-span-3 lg:pr-6'>
            <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
              {t('Universal access')}
            </span>
            <p className='text-muted-foreground/65 mt-2 max-w-xs text-xs leading-relaxed'>
              {t(
                'Works with the OpenAI SDK, Python, JavaScript, cURL, and any OpenAI-compatible client or agent.'
              )}
            </p>
          </div>

          <div className='border-border/40 flex min-w-0 flex-wrap content-start items-start gap-2 border-t pt-5 lg:col-span-6 lg:border-t-0 lg:border-l lg:px-6 lg:pt-0'>
            {ACCESS_ENTRIES.map((entry) => (
              <AccessChip key={entry.key} entry={entry} t={t} />
            ))}
            <a
              href='https://cherry-ai.com'
              target='_blank'
              rel='noopener noreferrer'
              className='group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200'
            >
              <CherryStudio.Color size={18} className='shrink-0' />
              <span>Cherry Studio</span>
            </a>
            <a
              href='https://ccswitch.io'
              target='_blank'
              rel='noopener noreferrer'
              className='group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200'
            >
              <img
                src='https://ccswitch.io/favicon.png'
                alt='CC Switch'
                className='size-[18px] shrink-0 rounded-sm object-contain'
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                  const fallback = event.currentTarget
                    .nextSibling as HTMLElement
                  if (fallback) fallback.style.display = 'flex'
                }}
              />
              <span
                style={{ display: 'none' }}
                className='size-[18px] shrink-0 items-center justify-center rounded-sm bg-blue-500/10 text-[8px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'
              >
                CC
              </span>
              <span>CC Switch</span>
            </a>
            <span className='group border-border/40 bg-muted/15 text-foreground/55 inline-flex cursor-default items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium'>
              <MoreIcon />
              <span>{t('More Apps')}</span>
            </span>
          </div>

          <ul
            data-testid='hero-proof-stats'
            className={`border-border/40 grid min-w-0 gap-3 border-t pt-5 lg:col-span-3 lg:grid-cols-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6 ${
              hasModelCount ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            }`}
          >
            {hasModelCount ? (
              <li
                className='border-border/30 flex min-w-0 items-baseline justify-between gap-3 border-b pb-3 sm:block sm:border-b-0 sm:pb-0 lg:flex lg:border-b lg:pb-3'
                data-testid='hero-stat-available-models'
              >
                <span className='text-2xl font-bold tracking-tight'>
                  {modelCount}
                </span>
                <span className='text-muted-foreground text-right text-xs sm:block sm:text-left lg:text-right'>
                  {t('Available models')}
                </span>
              </li>
            ) : null}
            <li
              className='border-border/30 flex min-w-0 items-center border-b pb-3 sm:border-b-0 sm:pb-0 lg:border-b lg:pb-3'
              data-testid='hero-stat-openai-compatible'
            >
              <span className='text-sm font-bold tracking-tight'>
                {t('OpenAI-compatible')}
              </span>
            </li>
            <li
              className='flex min-w-0 items-center'
              data-testid='hero-stat-unified-api-and-billing'
            >
              <span className='text-sm font-bold tracking-tight'>
                {t('Unified API and billing')}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Universal-access chip list and renderer
// ---------------------------------------------------------------------------

interface AccessEntry {
  /** Global-namespace i18n key for the chip label. */
  key: string
  /**
   * External absolute URL (https://…) renders as `<a target="_blank"
   * rel="noopener noreferrer">`. Internal paths render as TanStack
   * `<Link to={…}>` so in-app navigation never triggers a full
   * document reload. There is no third shape: external anchors and
   * internal route links are strictly separated.
   */
  href: string
}

const ACCESS_ENTRIES: readonly AccessEntry[] = [
  { key: 'OpenAI SDK', href: 'https://platform.openai.com/docs/libraries' },
  { key: 'Python', href: 'https://pypi.org/project/openai/' },
  { key: 'JavaScript', href: 'https://www.npmjs.com/package/openai' },
  { key: 'cURL', href: 'https://curl.se/' },
  {
    key: 'OpenAI-compatible clients and agents',
    href: '/docs/agents',
  },
] as const

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

function AccessChip({
  entry,
  t,
}: {
  entry: AccessEntry
  t: (key: string) => string
}): ReactElement {
  const testId = `hero-access-chip-${entry.key
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')}`
  const className =
    'border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200'

  if (isExternalHref(entry.href)) {
    return (
      <a
        data-testid={testId}
        href={entry.href}
        target='_blank'
        rel='noopener noreferrer'
        className={className}
      >
        {t(entry.key)}
      </a>
    )
  }

  return (
    <Link data-testid={testId} to={entry.href} className={className}>
      {t(entry.key)}
    </Link>
  )
}
