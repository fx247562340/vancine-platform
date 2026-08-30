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
import { ChevronDownIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { trackEvent } from '@/lib/analytics'
import {
  DEVELOPER_SOLUTIONS,
  DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY,
} from '@/lib/developer-solutions'
import { cn } from '@/lib/utils'

import { DOCS_NS } from '../i18n/loader'
import { DOCS_AGENT_TOOLS, type DocsAgentToolKey } from '../lib/agents'
import { DOCS_NAV_GROUPS } from '../nav'
import type { DocsSlug } from '../types'
import { DocsSearchBox } from './search-box'

interface SidebarContentProps {
  activeSlug: DocsSlug | null
  /** The agent guide currently open, when inside the Agent Integration Center. */
  activeAgentTool?: DocsAgentToolKey | null
  onNavigate?: () => void
}

/**
 * Persistent Developer solutions block at the bottom of the Docs sidebar.
 * Rendered from the shared registry with the GLOBAL i18n namespace (not the
 * Docs namespace), and never touches DOCS_NAV_GROUPS, the slug registry, the
 * search index, or prev/next navigation.
 */
function DocsDeveloperSolutions(props: {
  onNavigate?: () => void
}): ReactElement {
  const { t } = useTranslation()

  return (
    <div className='border-border border-t pt-4'>
      <p className='text-muted-foreground mb-1 px-3 text-xs font-semibold tracking-wide uppercase'>
        {t(DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY)}
      </p>
      <div className='flex flex-col gap-0.5'>
        {DEVELOPER_SOLUTIONS.map((solution) => (
          <Link
            key={solution.id}
            to={solution.route}
            onClick={() => {
              trackEvent('developer_resource_clicked', {
                resource: solution.resource,
                location: 'docs',
              })
              props.onNavigate?.()
            }}
            className='text-muted-foreground hover:text-foreground focus-visible:ring-ring block rounded-lg border-l-2 border-l-transparent px-3 py-2 text-sm transition-colors focus-visible:ring-2'
          >
            {t(solution.titleKey)}
          </Link>
        ))}
      </div>
    </div>
  )
}

function SidebarContent(props: SidebarContentProps) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })

  return (
    <nav aria-label={t('common.navigation')} className='flex flex-col gap-4'>
      <DocsSearchBox />
      {DOCS_NAV_GROUPS.map((group) => (
        <div key={group.groupKey}>
          <p className='text-muted-foreground mb-1 px-3 text-xs font-semibold tracking-wide uppercase'>
            {t(`nav.${group.groupKey}`)}
          </p>
          <div className='flex flex-col gap-0.5'>
            {group.items.map((item) => {
              const active = props.activeSlug === item.slug
              // The Agent Integration parent doubles as the /docs/agents
              // overview entry: on the hub it IS the current page, on a tool
              // guide it keeps only the group highlight while the matching
              // child below owns aria-current.
              const isAgentsItem = item.slug === 'agents'
              const parentCurrent =
                active && (!isAgentsItem || !props.activeAgentTool)
              const ariaCurrent = parentCurrent ? 'page' : undefined
              // Shared link behavior for both branch targets below.
              const sharedLinkProps = {
                onClick: props.onNavigate,
                // The active highlight is computed manually from activeSlug
                // (which also covers the nested agent guide routes). TanStack
                // Router additionally auto-applies aria-current="page" on
                // prefix matches (e.g. the agent parent under an unknown
                // /docs/agents/<x> subpath, or the guide children under
                // longer aliases); requiring an exact match keeps unknown
                // paths from declaring any current item. activeProps then
                // pins the attribute on the hub parent, where the router
                // state and our manual state agree.
                activeOptions: { exact: true },
                activeProps: { 'aria-current': ariaCurrent },
                inactiveProps: { 'aria-current': ariaCurrent },
                className: cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2',
                  active
                    ? 'bg-primary/10 text-primary border-l-primary border-l-2 font-semibold'
                    : 'text-muted-foreground hover:text-foreground border-l-2 border-l-transparent'
                ),
              } as const
              return (
                <div key={item.slug} className='flex flex-col gap-0.5'>
                  {isAgentsItem ? (
                    <Link to='/docs/agents' {...sharedLinkProps}>
                      {t(`nav.${item.titleKey}`)}
                    </Link>
                  ) : (
                    <Link
                      to='/docs/$slug'
                      params={{ slug: item.slug }}
                      {...sharedLinkProps}
                    >
                      {t(`nav.${item.titleKey}`)}
                    </Link>
                  )}
                  {isAgentsItem && active && (
                    <div className='border-border/60 ml-4 flex flex-col gap-0.5 border-l pl-2'>
                      {DOCS_AGENT_TOOLS.map((tool) => {
                        const childCurrent = props.activeAgentTool === tool.key
                        return (
                          <Link
                            key={tool.key}
                            to={tool.path}
                            onClick={props.onNavigate}
                            // Exact matching only: a child must never inherit
                            // aria-current from prefix matches on unknown
                            // /docs/agents/<x> subpaths or longer aliases.
                            activeOptions={{ exact: true }}
                            activeProps={{
                              'aria-current': childCurrent ? 'page' : undefined,
                            }}
                            inactiveProps={{
                              'aria-current': childCurrent ? 'page' : undefined,
                            }}
                            className={cn(
                              'block rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                              'focus-visible:ring-ring focus-visible:ring-2',
                              childCurrent
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {tool.displayName}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <DocsDeveloperSolutions onNavigate={props.onNavigate} />
    </nav>
  )
}

export function DocsSidebar(props: {
  activeSlug: DocsSlug | null
  activeAgentTool?: DocsAgentToolKey | null
}) {
  const { t } = useTranslation(DOCS_NS, { useSuspense: false })
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className='w-full shrink-0 lg:w-56'>
      {/* Mobile toggle */}
      <button
        type='button'
        className='border-border bg-muted/50 text-foreground mb-4 flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium lg:hidden'
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-controls='docs-mobile-nav'
      >
        {t('common.navigation')}
        <ChevronDownIcon
          aria-hidden='true'
          className={cn(
            'h-4 w-4 transition-transform',
            mobileOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div id='docs-mobile-nav' className='mb-4 lg:hidden'>
          <SidebarContent
            activeSlug={props.activeSlug}
            activeAgentTool={props.activeAgentTool}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Desktop sidebar */}
      <div className='sticky top-20 hidden lg:block'>
        <SidebarContent
          activeSlug={props.activeSlug}
          activeAgentTool={props.activeAgentTool}
        />
      </div>
    </div>
  )
}
