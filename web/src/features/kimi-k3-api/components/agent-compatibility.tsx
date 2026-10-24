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
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { KimiK31ModelId } from '../lib/landing'

export function AgentCompatibility(props: {
  modelId: KimiK31ModelId
}): ReactElement {
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
          <p className='text-muted-foreground max-w-3xl'>
            {t('Kimi K3.1 Pro and Highspeed are not live-verified on Vancine.')}
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Configure a Vancine provider')}</CardTitle>
              <CardDescription>OpenCode</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
              <p>
                {t(
                  'Use the OpenAI-compatible SDK provider, the Vancine base URL, and an environment-backed key.'
                )}
              </p>
              <p>
                <span className='text-muted-foreground'>
                  {t('Selected model ID')}
                </span>
                <code className='mt-1 block font-mono text-sm'>
                  {props.modelId}
                </code>
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
                <li>
                  {t('Selected model ID')}{' '}
                  <code className='text-foreground font-mono'>
                    {props.modelId}
                  </code>
                </li>
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
            <CardContent className='flex flex-col gap-3'>
              <p>
                {t(
                  'Set the base URL to https://vancine.com/v1 and use your VANCINE_API_KEY.'
                )}
              </p>
              <p className='flex items-start gap-2'>
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  className='text-muted-foreground mt-0.5 shrink-0'
                  aria-hidden='true'
                />
                <span className='text-muted-foreground text-xs'>
                  {t(
                    'Official docs describe streaming, reasoning_effort, and tool calling for these model IDs. Vancine has not live-verified those capabilities for Kimi K3.1 Pro or Highspeed.'
                  )}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        <ul className='text-muted-foreground list-disc space-y-2 pl-5 text-sm'>
          <li>
            {t(
              'The public starter repository still targets kimi-k3 only. It is a historical K3 asset, not a K3.1 verified example.'
            )}
          </li>
          <li>
            {t(
              'Moonshot says full model weights will be released by November 4, 2026. They are not open yet.'
            )}
          </li>
          <li>
            {t(
              'Official guide: about 2–3× the speed of Kimi K3.1 Pro. Not a Vancine measurement.'
            )}
          </li>
        </ul>
      </div>
    </section>
  )
}
