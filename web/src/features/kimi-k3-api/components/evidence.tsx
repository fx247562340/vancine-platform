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
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trackEvent } from '@/lib/analytics'

import {
  KIMI_K3_API_COMPATIBILITY_EVIDENCE,
  KIMI_K3_EVIDENCE_FILE_URL,
  KIMI_K3_EVIDENCE_LIMITATION_KEYS,
  KIMI_K3_EVIDENCE_STARTER_REPO,
  KIMI_K3_MEASURED_USAGE_EVIDENCE,
  KIMI_K3_OPENCODE_AGENT_EVIDENCE,
  KIMI_K3_RESOURCE_EVENT,
} from '../lib/landing'

interface EvidenceStat {
  label: string
  value: string
}

function EvidenceStatList(props: { stats: EvidenceStat[] }): ReactElement {
  return (
    <dl className='flex flex-col gap-2'>
      {props.stats.map((stat) => (
        <div
          key={stat.label}
          className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5'
        >
          <dt className='text-muted-foreground text-xs'>{stat.label}</dt>
          <dd className='text-foreground text-xs font-medium break-all'>
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Published historical evidence from the single controlled verification run,
 * with the mandatory public caveats bounding what it may be read as.
 */
export function Evidence(): ReactElement {
  const { t } = useTranslation()
  const agent = KIMI_K3_OPENCODE_AGENT_EVIDENCE
  const probe = KIMI_K3_API_COMPATIBILITY_EVIDENCE
  const usage = KIMI_K3_MEASURED_USAGE_EVIDENCE

  const agentStats: EvidenceStat[] = [
    {
      label: t('Agent client'),
      value: `${agent.client} ${agent.clientVersion}`,
    },
    { label: t('Execution environment'), value: agent.executor },
    {
      label: t('Model steps completed'),
      value: String(agent.modelStepsCompleted),
    },
    {
      label: t('Tool calls completed (read / edit / bash)'),
      value: `${agent.toolCalls.read.completed} / ${agent.toolCalls.edit.completed} / ${agent.toolCalls.bash.completed}`,
    },
    {
      label: t('Tool calls failed'),
      value: String(
        agent.toolCalls.read.failed +
          agent.toolCalls.edit.failed +
          agent.toolCalls.bash.failed
      ),
    },
    { label: t('Tests'), value: agent.testsPassed ? t('PASS') : t('FAIL') },
    { label: t('Run duration'), value: `${agent.durationMs} ms` },
    {
      label: t('Agent telemetry tokens (total)'),
      value: String(agent.telemetryTokens.total),
    },
    { label: t('Run ID'), value: agent.runId },
  ]

  const probeStats: EvidenceStat[] = [
    {
      label: t('temperature:0 probe accepted'),
      value: `HTTP ${probe.httpStatus}`,
    },
    { label: t('Requested model'), value: probe.requestedModel },
    { label: t('Response model'), value: probe.responseModel },
    {
      label: t('Usage (prompt / completion / total tokens)'),
      value: `${probe.usagePromptTokens} / ${probe.usageCompletionTokens} / ${probe.usageTotalTokens}`,
    },
    { label: t('Reasoning tokens'), value: String(probe.usageReasoningTokens) },
    { label: t('Completion stop reason'), value: probe.finishReason },
  ]

  const usageStats: EvidenceStat[] = [
    {
      label: t('Measured Vancine usage'),
      value: `$${usage.amount.toFixed(2)} ${usage.currency}`,
    },
    {
      label: t('Agent telemetry tokens (total)'),
      value: String(agent.telemetryTokens.total),
    },
    {
      label: t(
        'Token breakdown (input / output / reasoning / cache read / cache write)'
      ),
      value: `${agent.telemetryTokens.input} / ${agent.telemetryTokens.output} / ${agent.telemetryTokens.reasoning} / ${agent.telemetryTokens.cacheRead} / ${agent.telemetryTokens.cacheWrite}`,
    },
  ]

  const trackEvidenceResource = (): void =>
    trackEvent(KIMI_K3_RESOURCE_EVENT, {
      resource: 'starter_repo',
      location: 'evidence',
    })

  return (
    <section
      id='evidence'
      aria-labelledby='kimi-k3-evidence-title'
      className='mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 md:px-6'
    >
      <div className='flex flex-col gap-2'>
        <h2 id='kimi-k3-evidence-title' className='text-3xl font-bold'>
          {t('Live verification evidence')}
        </h2>
        <p className='text-muted-foreground max-w-3xl'>
          {t(
            'Three recorded checks against the real kimi-k3 model through the Vancine endpoint: API compatibility, a completed OpenCode coding-agent run, and the measured usage of that run.'
          )}
        </p>
      </div>

      <div className='mt-8 grid gap-4 lg:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle className='flex flex-wrap items-center gap-2'>
              {t('OpenCode coding agent')}
              <Badge variant='secondary'>{t('Verified')}</Badge>
            </CardTitle>
            <CardDescription>
              {t('Model steps completed')}: {String(agent.modelStepsCompleted)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EvidenceStatList stats={agentStats} />
          </CardContent>
          <CardFooter className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              render={
                <a
                  href={KIMI_K3_EVIDENCE_FILE_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
              onClick={trackEvidenceResource}
            >
              {t('View public evidence file')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              render={
                <a
                  href={KIMI_K3_EVIDENCE_STARTER_REPO}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
              onClick={trackEvidenceResource}
            >
              {t('View starter repository')}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex flex-wrap items-center gap-2'>
              {t('API compatibility')}
              <Badge variant='secondary'>{t('Verified')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <EvidenceStatList stats={probeStats} />
            <p className='text-muted-foreground text-xs'>
              {t(
                'The probe used a 16-token completion budget that was mostly consumed by reasoning, so its visible content is inconclusive. This small reasoning-heavy response is not a content-generation failure.'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex flex-wrap items-center gap-2'>
              {t('Measured usage')}
              <Badge variant='outline'>{t('Measured')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <EvidenceStatList stats={usageStats} />
            <p className='text-muted-foreground text-xs'>
              {t(
                'This controlled verification run incurred $0.19 in measured Vancine usage for one controlled task only. Pricing and token usage vary by task, and this historical measurement is not a current price or credit commitment.'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <aside
        aria-label={t('Live verification evidence')}
        className='border-border bg-muted/30 mt-6 rounded-lg border p-4'
      >
        <ul className='flex flex-col gap-2'>
          {KIMI_K3_EVIDENCE_LIMITATION_KEYS.map((limitationKey) => (
            <li key={limitationKey} className='flex items-start gap-2'>
              <HugeiconsIcon
                icon={Alert02Icon}
                className='text-muted-foreground mt-0.5 size-3.5 shrink-0'
                aria-hidden='true'
              />
              <span className='text-muted-foreground text-xs'>
                {t(limitationKey)}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  )
}
