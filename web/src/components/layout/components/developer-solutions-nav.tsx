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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { trackEvent } from '@/lib/analytics'
import {
  DEVELOPER_SOLUTIONS,
  DEVELOPER_SOLUTIONS_MENU_LABEL_KEY,
  DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY,
  type DeveloperSolution,
} from '@/lib/developer-solutions'

function trackSolutionClick(
  solution: DeveloperSolution,
  location: string
): void {
  trackEvent('developer_resource_clicked', {
    resource: solution.resource,
    location,
  })
}

/**
 * Desktop public-header entry: an accessible Base UI navigation menu listing
 * every live developer solution from the shared registry. Keyboard open,
 * arrow-key switching, and focus management come from the Base UI primitive;
 * dynamic backend-configured nav links are rendered separately and untouched.
 */
export function DeveloperSolutionsNav(): ReactElement {
  const { t } = useTranslation()

  return (
    <NavigationMenu className='flex-none'>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>
            {t(DEVELOPER_SOLUTIONS_MENU_LABEL_KEY)}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className='grid w-[26rem] max-w-[calc(100vw-2rem)] gap-1'>
              {DEVELOPER_SOLUTIONS.map((solution) => (
                <li key={solution.id}>
                  <NavigationMenuLink
                    render={<Link to={solution.route} />}
                    onClick={() => trackSolutionClick(solution, 'header')}
                    className='flex-col items-start gap-0.5'
                  >
                    <span className='font-medium'>{t(solution.titleKey)}</span>
                    <span className='text-muted-foreground text-xs font-normal'>
                      {t(solution.descriptionKey)}
                    </span>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

export interface DeveloperSolutionsMobileLinksProps {
  /** Called after activating a link so the mobile menu can close. */
  onNavigate: () => void
}

/**
 * Mobile full-screen menu entry: a clearly grouped list of the same registry
 * links. Activating a link closes the mobile menu through `onNavigate`.
 */
export function DeveloperSolutionsMobileLinks(
  props: DeveloperSolutionsMobileLinksProps
): ReactElement {
  const { t } = useTranslation()

  return (
    <div className='mt-4'>
      <p className='text-muted-foreground px-1 pb-2 text-xs font-semibold tracking-widest uppercase'>
        {t(DEVELOPER_SOLUTIONS_SECTION_LABEL_KEY)}
      </p>
      <div className='flex flex-col gap-1'>
        {DEVELOPER_SOLUTIONS.map((solution) => (
          <Link
            key={solution.id}
            to={solution.route}
            onClick={() => {
              trackSolutionClick(solution, 'header')
              props.onNavigate()
            }}
            className='text-muted-foreground hover:text-foreground flex items-center gap-3 py-2 text-base font-medium tracking-tight transition-colors'
          >
            {t(solution.titleKey)}
          </Link>
        ))}
      </div>
    </div>
  )
}
