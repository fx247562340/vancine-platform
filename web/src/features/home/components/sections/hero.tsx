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
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { trackEvent } from '@/lib/analytics'

import type { HomepageStatsState } from '../../hooks/use-homepage-stats'
import type { HomepagePricingState } from '../../lib/homepage-pricing'
import { BrandLightTunnel } from '../brand-light-tunnel'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
  pricing?: HomepagePricingState
  stats?: HomepageStatsState
  theme?: 'light' | 'dark'
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Compact thousands-separator for the live stat numbers. A real 0
 * (availability=ok) renders "0"; only an unavailable / not-yet-ready
 * value (null) renders the em-dash placeholder. */
function formatCompact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  // Intl.NumberFormat with notation:compact gives 1.2K / 3.4M which is
  // exactly the shape the hero tile needs.
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

/** Integer thousands-separator (no abbreviation). Same real-0 rule
 * as formatCompact. */
function formatInteger(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl = (status?.docs_link as string | undefined)?.trim() || ''

  const statsState: HomepageStatsState = props.stats ?? {
    status: 'loading',
    stats: null,
  }
  const ready = statsState.status === 'ready' && statsState.stats

  // Per-aggregate value + availability. The hero MUST show the
  // em-dash placeholder when an aggregate is "unavailable" — the
  // marketing tile can never display a fake 0 just because the DB
  // blipped, and it can never display a real number that the
  // server told us is broken. A helper keeps the rendering rule
  // local so the three tiles agree on the placeholder.
  const showTriple = (
    triple: { value: number; availability: 'ok' | 'unavailable' } | null
  ) => (triple && triple.availability === 'ok' ? triple.value : null)

  const successful =
    ready && statsState.stats
      ? showTriple(statsState.stats.successful_requests)
      : null
  const tokens =
    ready && statsState.stats
      ? showTriple(statsState.stats.processed_tokens)
      : null
  // The "available models" tile must always show the model count
  // and never silently fall back to the vendor count: the two
  // numbers describe different things. The vendor count lives in
  // the ToolsAndAccess tile, not here.
  const modelCount =
    (props.pricing?.status === 'ready' || props.pricing?.status === 'empty') &&
    typeof props.pricing.count === 'number' &&
    props.pricing.count >= 0
      ? props.pricing.count
      : null

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
    <section
      className='relative z-10 overflow-hidden px-6 pt-28 pb-20 md:pt-36 md:pb-28 lg:pt-40 lg:pb-32'
      data-testid='homepage-hero'
    >
      {/*
        One continuous Vancine light field replaces the former pair of
        image ribbons. Its moving depth pulses and two-lobe distortion echo
        the brand mark without becoming a literal logo. WebGL is decorative,
        theme-aware, pointer-transparent and clipped to the hero; the headline,
        CTAs and live stats remain ordinary accessible content above it.
      */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
      >
        <BrandLightTunnel
          appearance={props.theme ?? 'light'}
          className='absolute inset-0'
        />
      </div>

      {/* Soft radial wash behind the headline; the ribbons still
          need to read clearly so the wash is light. */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.14]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 50% 80%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
      {/* Grid pattern */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.06]'
      />

      {/* The light field dissolves into the first content block instead of
          ending on the hero boundary. This bridge is decorative and shares
          its colors with the follow-up section below. */}
      <div aria-hidden className='vancine-hero-scene-transition' />

      <div className='relative z-10 mx-auto max-w-4xl'>
        <div className='flex flex-col items-center text-center'>
          <div
            className='landing-animate-fade-up mb-6 inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-[11px] font-medium text-blue-600 opacity-0 shadow-xs dark:border-blue-400/20 dark:bg-blue-400/5 dark:text-blue-400'
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
            className='landing-animate-fade-up text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.08] font-bold tracking-tight text-balance opacity-0'
            style={{ animationDelay: '60ms', maxWidth: '20ch' }}
          >
            {t('One API for Chinese frontier and high-performance AI models')}
          </h1>
          <p
            className='landing-animate-fade-up text-muted-foreground/80 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-balance opacity-0 md:text-[17px]'
            style={{ animationDelay: '120ms' }}
          >
            {t(
              'Access flagship and fast-inference models for reasoning, coding, multimodal workflows, AI agents, and high-throughput applications through one OpenAI-compatible API.'
            )}
          </p>

          <div
            className='landing-animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-3 opacity-0'
            style={{ animationDelay: '180ms' }}
          >
            <Button
              className='group h-11 rounded-lg px-5 text-sm font-medium'
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
              }
              onClick={() =>
                trackEvent('get_started_clicked', { location: 'hero' })
              }
            >
              {props.isAuthenticated
                ? t('Go to Dashboard')
                : t('Create account')}
              <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Button>
            <Button
              variant='outline'
              className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
              render={<Link to='/pricing' />}
              onClick={() =>
                trackEvent('explore_models_clicked', { location: 'hero' })
              }
            >
              {t('View available models')}
            </Button>
            {renderDocsButton()}
          </div>

          <div
            className='landing-animate-fade-up mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 opacity-0'
            style={{ animationDelay: '210ms' }}
          >
            <Link
              to='/docs'
              className='text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-4'
              onClick={() =>
                trackEvent('docs_link_clicked', { location: 'hero' })
              }
            >
              {t('Read the docs')}
            </Link>
            <Link
              to='/openrouter-alternative'
              className='text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-4'
              onClick={() =>
                trackEvent('openrouter_compare_clicked', { location: 'hero' })
              }
            >
              {t('Compare Vancine with OpenRouter')}
            </Link>
          </div>

          {/*
            Three live stats. Each tile is its own accessible block:
            the value is the primary text node, the label is the
            descriptive copy. Numbers animate from 0 to the live
            value on first reveal; the placeholder is "—" until
            the network responds. The "as of" line below the tiles
            is a single shared source-of-truth note that is shown
            on every render (loading or not) so the visitor knows
            why a number might be missing.
          */}
          <dl
            data-testid='hero-stats-row'
            className='landing-animate-fade-up mt-10 grid w-full max-w-3xl grid-cols-1 gap-6 opacity-0 sm:grid-cols-3'
            style={{ animationDelay: '280ms' }}
          >
            <StatTile
              value={formatInteger(successful)}
              label={t('Successful requests, 30 days')}
              testId='hero-stat-successful-requests'
            />
            <StatTile
              value={formatCompact(tokens)}
              label={t('Processed tokens, 30 days')}
              testId='hero-stat-processed-tokens'
            />
            <StatTile
              value={formatInteger(modelCount)}
              label={t('Available models')}
              testId='hero-stat-available-models'
            />
          </dl>

          <p
            className='text-muted-foreground/55 mt-4 text-center text-[11px]'
            data-testid='hero-stats-disclaimer'
          >
            {t(
              'Aggregated operation metrics may be delayed. Stats are aggregate counts only — no user, key, channel, or billing detail is exposed.'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Stat tile — small accessible block used inside the hero's <dl>.
// ---------------------------------------------------------------------------

function StatTile(props: { value: string; label: string; testId: string }) {
  // The DOM order MUST be dt (label) before dd (value) to follow the
  // HTML <dl> spec; the visual order is reversed with flex order so
  // the headline number still reads first.
  return (
    <div
      data-testid={props.testId}
      className='flex flex-col items-center gap-1'
    >
      <dt className='text-muted-foreground/80 order-2 text-center text-xs leading-snug'>
        {props.label}
      </dt>
      <dd className='text-2xl font-bold tracking-tight tabular-nums order-1 md:text-3xl'>
        {props.value}
      </dd>
    </div>
  )
}
