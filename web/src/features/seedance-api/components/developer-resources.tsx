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
  ArrowUpRight01Icon,
  BookOpen01Icon,
  SourceCodeIcon,
  WorkflowSquareIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { trackEvent } from '@/lib/analytics'

import {
  SEEDANCE_DEVELOPER_RESOURCES,
  SEEDANCE_RESOURCE_EVENT,
  type SeedanceDeveloperResource,
} from '../lib/landing'

/**
 * Icon per resource. Keyed by the stable analytics id rather than the URL so a
 * destination change can never silently drop the icon.
 */
const RESOURCE_ICONS = {
  github: SourceCodeIcon,
  postman: BookOpen01Icon,
  n8n: WorkflowSquareIcon,
} as const satisfies Record<
  SeedanceDeveloperResource['id'],
  typeof SourceCodeIcon
>

/** Where this block sits, for analytics. One fixed value, never a URL. */
const RESOURCE_LOCATION = 'seedance_developer_resources'

/**
 * The three published developer artifacts for the same async video workflow:
 * the GitHub starter, the Postman documentation, and the n8n workflow
 * template. Deliberately placed after the quickstart so it answers "what do I
 * use this in?" once the reader has the request itself.
 *
 * The copy states only what is verifiable. The Postman entry is documentation,
 * not a runnable Collection, because the public Collection was unpublished.
 */
export function DeveloperResources(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='seedance-developer-resources-title'
      className='bg-muted/30 mx-auto w-full max-w-4xl px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2 text-center'>
        <h2
          id='seedance-developer-resources-title'
          className='text-3xl font-bold'
        >
          {t('Developer resources')}
        </h2>
        <p className='text-muted-foreground'>
          {t(
            'Ready to wire this into your own tooling? These are the published assets for the same async video workflow.'
          )}
        </p>
      </div>

      <ul className='mt-8 grid gap-4 sm:grid-cols-3'>
        {SEEDANCE_DEVELOPER_RESOURCES.map((resource) => (
          <li key={resource.id}>
            <Card className='h-full'>
              <CardContent className='flex h-full flex-col gap-3'>
                <HugeiconsIcon
                  icon={RESOURCE_ICONS[resource.id]}
                  className='text-primary size-6'
                  aria-hidden='true'
                />
                <div className='flex-1'>
                  <h3 className='text-sm font-semibold'>
                    <a
                      href={resource.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='hover:underline'
                      onClick={() =>
                        trackEvent(SEEDANCE_RESOURCE_EVENT, {
                          resource: resource.id,
                          location: RESOURCE_LOCATION,
                        })
                      }
                    >
                      {t(resource.titleKey)}
                      <HugeiconsIcon
                        icon={ArrowUpRight01Icon}
                        className='ml-1 inline size-3.5'
                        aria-hidden='true'
                      />
                    </a>
                  </h3>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {t(resource.descriptionKey)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
