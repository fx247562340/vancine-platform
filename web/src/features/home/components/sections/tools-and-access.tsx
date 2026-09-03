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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { trackEvent } from '@/lib/analytics'

import type { HomepageStatsState } from '../../hooks/use-homepage-stats'

interface ToolsAndAccessProps {
  stats: HomepageStatsState
}

// ---------------------------------------------------------------------------
// Universal-access chip list. External absolute URLs render as
// <a target="_blank" rel="noopener noreferrer">; internal paths render
// as TanStack <Link> so in-app navigation never triggers a full
// document reload. The two shapes are strictly separated; there is no
// third case.
// ---------------------------------------------------------------------------

interface AccessEntry {
  key: string
  href: string
  // Discriminator for external vs internal render.
  external: boolean
}

const ACCESS_ENTRIES: readonly AccessEntry[] = [
  {
    key: 'OpenAI SDK',
    href: 'https://platform.openai.com/docs/libraries',
    external: true,
  },
  { key: 'Python', href: 'https://pypi.org/project/openai/', external: true },
  {
    key: 'JavaScript',
    href: 'https://www.npmjs.com/package/openai',
    external: true,
  },
  { key: 'cURL', href: 'https://curl.se/', external: true },
  {
    key: 'OpenAI-compatible clients and agents',
    href: '/docs/agents',
    external: false,
  },
] as const

// ---------------------------------------------------------------------------
// Guide / install entries. These replaced the v1.2.0 Cherry Studio /
// CC Switch chip pair to reflect the real relationship Vancine has
// with these two tools:
//
//   - OpenCode: Vancine is *listed* in the OpenCode provider catalog
//     (see /docs/agents/opencode). The chip routes to that page so
//     visitors can read the verified evidence and the integration
//     steps in one place.
//
//   - Pi Agent: Vancine ships a community extension for the Pi CLI
//     agent (see /docs/agents/pi). The chip is honest about the
//     community-extension status — there is no official partnership
//     claim on the homepage.
//
// The "More Apps" chip keeps a dead-end "more apps" affordance for
// readers who arrive looking for tooling that is not listed above;
// it routes to the same /docs/agents page, where the full list lives.
// ---------------------------------------------------------------------------

interface GuideEntry {
  /** Display label. Use a brand-name string when the upstream tool
   *  is the canonical name; never invent a marketing label. */
  key: string
  /** Internal /docs/agents/<slug> path. */
  href: string
}

const GUIDE_ENTRIES: readonly GuideEntry[] = [
  { key: 'OpenCode', href: '/docs/agents/opencode' },
  // Pi Agent's setup is documented on the Agent Integration hub today
  // (/docs/agents). A dedicated detail page is not part of this redesign
  // and would inflate the i18n bundle scope; the hub already lists the
  // npm package, the install command, and the community-extension
  // disclosure so the link is honest about what the reader gets.
  { key: 'Pi Agent', href: '/docs/agents' },
] as const

function AccessChip({ entry }: { entry: AccessEntry }) {
  const { t } = useTranslation()
  const className =
    'border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200'
  const label = t(entry.key)
  const testId = `tools-access-chip-${entry.key
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')}`
  if (entry.external) {
    return (
      <a
        data-testid={testId}
        href={entry.href}
        target='_blank'
        rel='noopener noreferrer'
        className={className}
      >
        {label}
      </a>
    )
  }
  return (
    <Link
      data-testid={testId}
      to={entry.href}
      className={className}
      onClick={() =>
        trackEvent('access_chip_clicked', { location: 'tools_and_access' })
      }
    >
      {label}
    </Link>
  )
}

function GuideRow({ entry }: { entry: GuideEntry }) {
  const { t } = useTranslation()
  return (
    <Link
      to={entry.href}
      data-testid={`tools-guide-${entry.key
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')}`}
      className='text-foreground/85 hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors'
      onClick={() =>
        trackEvent('guide_chip_clicked', {
          location: 'tools_and_access',
          resource: entry.key,
        })
      }
    >
      <span
        aria-hidden
        className='border-border/50 bg-muted/20 inline-flex size-6 items-center justify-center rounded-md border text-[10px] font-bold tracking-tight'
      >
        {entry.key.charAt(0)}
      </span>
      <span>{t(entry.key)}</span>
    </Link>
  )
}

function VendorCountStat({ stats }: { stats: HomepageStatsState }) {
  const { t } = useTranslation()
  const ready = stats.status === 'ready' && stats.stats
  const triple = ready && stats.stats ? stats.stats.active_vendor_count : null
  // The vendor count is its own tile, not a model-count fallback.
  // availability=ok renders the real value — including a real 0 on
  // a quiet deploy; only "unavailable" (or a not-ready state)
  // renders the em-dash so the tile can never claim "0 vendors"
  // while the backend is unreachable.
  const display = triple && triple.availability === 'ok' ? triple.value : '—'
  return (
    <div className='flex flex-col gap-1' data-testid='tools-vendor-stat'>
      <span
        className='text-2xl font-bold tracking-tight tabular-nums'
        aria-live='polite'
      >
        {display}
      </span>
      <span className='text-muted-foreground text-xs'>
        {t('Integrated model vendors')}
      </span>
      <span className='text-muted-foreground/60 text-[11px]'>
        {t('Counted in real time')}
      </span>
    </div>
  )
}

export function ToolsAndAccess(props: ToolsAndAccessProps) {
  const { t } = useTranslation()

  return (
    <section
      className='border-border/40 bg-muted/5 relative z-10 border-y px-6 py-20 md:py-24'
      aria-labelledby='homepage-tools-access-title'
      data-testid='homepage-tools-access-section'
    >
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-10 text-center md:mb-12'>
          <h2
            id='homepage-tools-access-title'
            className='text-2xl font-bold tracking-tight md:text-3xl'
          >
            {t('Bring your own tools')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-sm leading-relaxed md:text-base'>
            {t(
              'Use the SDKs, agents, and clients you already know. OpenCode and Pi Agent link to Vancine setup guidance; SDK links open their official references.'
            )}
          </p>
        </AnimateInView>

        <AnimateInView
          animation='scale-in'
          className='border-border/40 bg-background rounded-2xl border p-5 sm:p-7'
        >
          <div className='grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-12'>
            {/* Universal access — SDK + clients */}
            <div
              className='flex flex-col gap-3 md:col-span-5'
              data-testid='tools-universal-access'
            >
              <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
                {t('Universal access')}
              </span>
              <p className='text-muted-foreground/65 text-xs leading-relaxed'>
                {t(
                  'Works with the OpenAI SDK, Python, JavaScript, cURL, and any OpenAI-compatible client or agent.'
                )}
              </p>
              <div className='flex flex-wrap gap-2 pt-1'>
                {ACCESS_ENTRIES.map((entry) => (
                  <AccessChip key={entry.key} entry={entry} />
                ))}
              </div>
            </div>

            {/* Divider for tablet/desktop */}
            <div
              aria-hidden
              className='bg-border/40 hidden md:col-span-1 md:block md:w-px md:self-stretch'
            />

            {/* Setup guides — OpenCode / Pi Agent */}
            <div
              className='flex flex-col gap-3 md:col-span-4'
              data-testid='tools-setup-guides'
            >
              <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
                {t('Setup guides')}
              </span>
              <p className='text-muted-foreground/65 text-xs leading-relaxed'>
                {t('Coding agents and CLI tools with Vancine setup guidance.')}
              </p>
              <div className='flex flex-col gap-2 pt-1'>
                {GUIDE_ENTRIES.map((entry) => (
                  <GuideRow key={entry.key} entry={entry} />
                ))}
                <Link
                  to='/docs/agents'
                  data-testid='tools-guide-more'
                  className='text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs font-medium transition-colors'
                  onClick={() =>
                    trackEvent('guide_more_clicked', {
                      location: 'tools_and_access',
                    })
                  }
                >
                  {t('More tools')}{' '}
                  <span
                    aria-hidden
                    className='transition-transform group-hover:translate-x-0.5'
                  >
                    →
                  </span>
                </Link>
              </div>
            </div>

            {/* Active vendor count — derived from the same /api/pricing
                payload that drives the model tiles; never a hard-coded
                vendor-table count. */}
            <div
              className='border-border/40 flex flex-col gap-2 border-t pt-6 md:col-span-2 md:border-t-0 md:border-l md:pt-0 md:pl-6'
              data-testid='tools-vendor-block'
            >
              <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
                {t('OpenAI-compatible')}
              </span>
              <VendorCountStat stats={props.stats} />
            </div>
          </div>

          <div aria-hidden className='border-border/30 mt-7 border-t pt-4' />
          <p
            className='text-muted-foreground/60 text-center text-xs'
            data-testid='tools-disclosure'
          >
            {t(
              'OpenCode provider catalog · Pi community extension. No official partnership is implied.'
            )}
          </p>
        </AnimateInView>
      </div>
    </section>
  )
}
