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
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Agent compatibility matrix. Only OpenCode may be described as live
 * verified; Cline, Roo Code, and generic OpenAI-compatible clients are
 * configuration-compatible statements only.
 */
export function AgentCompatibility(): ReactElement {
  const { t } = useTranslation()

  return (
    <section
      id='agents'
      aria-labelledby='kimi-k3-agents-title'
      className='bg-muted/30 scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='mx-auto flex w-full max-w-5xl flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <h2 id='kimi-k3-agents-title' className='text-3xl font-bold'>
            {t('Agent setup')}
          </h2>
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                OpenCode
                <Badge variant='secondary'>
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    data-icon='inline-start'
                    aria-hidden='true'
                  />
                  {t('Verified')}
                </Badge>
              </CardTitle>
              <CardDescription>
                {t('Configure a Vancine provider')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                {t(
                  'Use the OpenAI-compatible SDK provider, the Vancine base URL, and an environment-backed key.'
                )}
              </p>
              <p className='text-muted-foreground mt-3 text-xs'>
                {t(
                  'Only OpenCode v1.18.3 has a live coding-agent verification so far. Cline and Roo Code configurations are provided in the starter repository but have not been independently live-verified.'
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Cline and Roo Code')}</CardTitle>
              <CardDescription>
                {t('Use the same OpenAI-compatible connection')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className='text-muted-foreground flex list-decimal flex-col gap-2 pl-4'>
                <li>{t('Choose OpenAI Compatible as the API provider.')}</li>
                <li>
                  {t(
                    'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.'
                  )}
                </li>
                <li>{t('Select kimi-k3 as the model ID.')}</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('OpenAI-compatible clients')}</CardTitle>
              <CardDescription>
                {t('Use the same OpenAI-compatible connection')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                {t(
                  'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.'
                )}
              </p>
              <p className='mt-3 flex items-start gap-2'>
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  className='text-muted-foreground mt-0.5 shrink-0'
                  aria-hidden='true'
                />
                <span className='text-muted-foreground text-xs'>
                  {t('Select kimi-k3 as the model ID.')}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
