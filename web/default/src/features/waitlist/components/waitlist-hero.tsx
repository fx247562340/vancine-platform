/*
Copyright (C) 2023-2026 QuantumNous
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useEffect, useState } from 'react'
import { Check, Loader2, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { joinWaitlist, getWaitlistCount } from '../api'

interface WaitlistHeroProps {
  joined: boolean
  onJoined: () => void
}

export function WaitlistHero({ joined, onJoined }: WaitlistHeroProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    getWaitlistCount()
      .then((res) => {
        if (res?.success && res.data?.count) {
          setCount(res.data.count)
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t('Please enter a valid email address'))
      return
    }
    setLoading(true)
    try {
      const res = await joinWaitlist(email, 'direct')
      if (res?.success) {
        toast.success(t('Successfully joined the waitlist!'))
        setCount((c) => c + 1)
        onJoined()
      }
    } catch {
      // handled by API interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-36 lg:pb-28'>
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
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.08]'
      />

      <div className='mx-auto max-w-3xl text-center'>
        <div
          className='landing-animate-fade-up mb-5 inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1.5 text-[11px] font-medium text-purple-600 opacity-0 shadow-xs dark:border-purple-400/20 dark:bg-purple-400/5 dark:text-purple-400'
          style={{ animationDelay: '0ms' }}
        >
          <span className='relative flex size-1.5'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75' />
            <span className='relative inline-flex size-1.5 rounded-full bg-purple-500 dark:bg-purple-400' />
          </span>
          <span>{t('Early Access')}</span>
        </div>

        <h1
          className='landing-animate-fade-up text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.15] font-bold tracking-tight opacity-0'
          style={{ animationDelay: '60ms' }}
        >
          {t('Chinese AI Models,')}
          <br />
          <span className='bg-gradient-to-r from-purple-400 via-violet-400 to-blue-500 bg-clip-text text-transparent'>
            {t('Globally Accessible')}
          </span>
        </h1>

        <p
          className='landing-animate-fade-up text-muted-foreground/80 mt-5 text-base leading-relaxed opacity-0 md:text-[15px]'
          style={{ animationDelay: '120ms' }}
        >
          {t('Access DeepSeek, Qwen, Seedream, Seedance and more through a single OpenAI-compatible API')}
        </p>

        <p
          className='landing-animate-fade-up text-muted-foreground/60 mt-2 text-sm leading-relaxed opacity-0'
          style={{ animationDelay: '150ms' }}
        >
          {t('No Chinese phone number · No Alipay · Pay in USD · Cheaper than direct Chinese APIs')}
        </p>

        <div
          className='landing-animate-fade-up mt-8 opacity-0'
          style={{ animationDelay: '180ms' }}
        >
          {joined ? (
            <div className='inline-flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-6 py-4 text-green-600 dark:border-green-400/20 dark:bg-green-400/5 dark:text-green-400'>
              <Check className='size-5' />
              <span className='font-medium'>
                {t("You're on the waitlist! We'll notify you when it's your turn.")}
              </span>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className='mx-auto flex max-w-md flex-col gap-3 sm:flex-row'
            >
              <div className='relative flex-1'>
                <Mail className='text-muted-foreground/50 absolute top-1/2 left-3 size-4 -translate-y-1/2' />
                <Input
                  type='email'
                  placeholder={t('Enter your email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className='h-11 pl-10'
                  required
                />
              </div>
              <Button
                type='submit'
                disabled={loading}
                className='group h-11 rounded-lg px-6 text-sm font-medium'
              >
                {loading ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  t('Join Waitlist')
                )}
              </Button>
            </form>
          )}
        </div>

        {count > 0 && (
          <div
            className='landing-animate-fade-up mt-5 opacity-0'
            style={{ animationDelay: '240ms' }}
          >
            <p className='text-muted-foreground/60 text-sm'>
              {t('{{count}} developers have joined the waitlist', { count })}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
