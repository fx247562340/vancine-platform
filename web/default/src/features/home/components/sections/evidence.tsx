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
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import { AnimateInView } from '@/components/animate-in-view'

/**
 * Kimi K3 OpenCode evidence facts. Mirrors the canonical constants in the
 * Classic theme (`pages/KimiK3Api/landing.js`). Single controlled historical
 * run — upstream cost is never published.
 */
const EVIDENCE = {
  clientVersion: '1.18.3',
  model: 'kimi-k3',
  modelSteps: 6,
  toolCalls: 7,
  testsPassed: true,
  durationMs: 84345,
  agentTelemetryTokens: 28707,
  amount: 0.19,
  currency: 'USD',
  starterRepo: 'https://github.com/VancineAI/kimi-k3-api-starter',
  evidenceUrl:
    'https://github.com/VancineAI/kimi-k3-api-starter/blob/main/results/opencode-agent.verified.json?utm_source=vancine&utm_medium=developer_resource&utm_campaign=kimi_k3_launch&utm_content=opencode_verified_evidence',
  kimiPage: '/kimi-k3-api',
} as const

export function Evidence() {
  const { t } = useTranslation()
  const durationSeconds = (EVIDENCE.durationMs / 1000).toFixed(1)

  const metrics = [
    { value: `v${EVIDENCE.clientVersion}`, label: t('OpenCode version') },
    { value: EVIDENCE.model, label: t('Model under test') },
    { value: EVIDENCE.modelSteps, label: t('Model steps') },
    { value: EVIDENCE.toolCalls, label: t('Tool calls') },
    {
      value: EVIDENCE.testsPassed ? t('Passed') : t('Failed'),
      label: t('Tests'),
    },
    { value: `${durationSeconds}s`, label: t('Duration') },
    {
      value: EVIDENCE.agentTelemetryTokens.toLocaleString('en-US'),
      label: t('Agent telemetry tokens'),
    },
    {
      value: `$${EVIDENCE.amount.toFixed(2)}`,
      label: t('Vancine measured usage'),
    },
  ]

  const link = (
    href: string,
    resource: 'kimi_k3_page' | 'starter_repo' | 'verified_json',
    label: string
  ) => (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='text-sm font-medium underline underline-offset-4'
      onClick={() =>
        trackEvent('evidence_link_clicked', {
          location: 'homepage',
          resource,
        })
      }
    >
      {t(label)}
    </a>
  )

  return (
    <section className='border-border/40 bg-muted/5 relative z-10 border-y px-6 py-20 md:py-24'>
      <div className='mx-auto max-w-4xl'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Verified in real agent workflows')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-3 max-w-2xl text-base leading-relaxed'>
            {t(
              'One controlled historical run — not a promise that every request will match these numbers.'
            )}
          </p>
        </AnimateInView>

        <AnimateInView
          animation='scale-in'
          className='border-border/40 bg-background rounded-2xl border p-6 md:p-10'
        >
          <div className='mb-8 grid grid-cols-2 gap-6 md:grid-cols-4'>
            {metrics.map((m) => (
              <div key={m.label} className='text-center'>
                <div className='text-2xl font-bold'>{m.value}</div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          <p className='text-muted-foreground/70 mb-6 text-center text-sm leading-relaxed'>
            {t(
              'Single controlled OpenCode run. Latency, tokens, and Vancine usage vary by task. This is historical evidence, not a guarantee for future calls.'
            )}
          </p>

          <div className='flex flex-wrap items-center justify-center gap-6'>
            {link(EVIDENCE.kimiPage, 'kimi_k3_page', 'View Kimi K3 page')}
            {link(
              EVIDENCE.starterRepo,
              'starter_repo',
              'View starter & verified evidence'
            )}
            {link(
              EVIDENCE.evidenceUrl,
              'verified_json',
              'Verified evidence JSON'
            )}
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
