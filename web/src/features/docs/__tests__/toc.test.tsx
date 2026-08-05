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
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsToc } from '../components/headings'
import { useRegisterHeadings } from '../components/register-headings'
import { TocProvider } from '../components/toc-context'
import type { TocHeading } from '../types'
import { initTestI18n, setDocsBundle, EN_DOCS } from './test-utils'

const HEADINGS: TocHeading[] = [
  { id: 'a', title: 'Section A', level: 2 },
  { id: 'b', title: 'Section B', level: 2 },
  { id: 'c', title: 'Section C', level: 3 },
]

function TocFixture() {
  useRegisterHeadings(HEADINGS)
  return (
    <div>
      <h2 id='a'>Section A</h2>
      <h2 id='b'>Section B</h2>
      <h3 id='c'>Section C</h3>
    </div>
  )
}

function tocLink(title: string): HTMLAnchorElement {
  const nav = screen.getByRole('navigation', { name: 'On this page' })
  return within(nav).getByText(title).closest('a') as HTMLAnchorElement
}

function renderToc() {
  return render(
    <TocProvider>
      <TocFixture />
      <DocsToc />
    </TocProvider>
  )
}

function setTop(id: string, top: number) {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 20,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

function fireScroll() {
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(async () => {
  await initTestI18n('en')
  setDocsBundle('en', EN_DOCS)
})

describe('DocsToc', () => {
  it('renders all headings with H3 indentation', () => {
    renderToc()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getByText('Section A')).toBeInTheDocument()
    expect(within(nav).getByText('Section B')).toBeInTheDocument()
    const cLink = tocLink('Section C')
    expect(cLink.className).toContain('pl-6')
  })

  it('marks the current heading with aria-current on scroll', () => {
    renderToc()
    // a and b are above the 120px offset; c is below → b is active.
    setTop('a', -100)
    setTop('b', 50)
    setTop('c', 400)
    fireScroll()

    const bLink = tocLink('Section B')
    expect(bLink?.getAttribute('aria-current')).toBe('location')
    const aLink = tocLink('Section A')
    expect(aLink?.getAttribute('aria-current')).toBeNull()
  })

  it('updates the active heading as scroll position changes', () => {
    renderToc()
    setTop('a', -100)
    setTop('b', 50)
    setTop('c', 400)
    fireScroll()
    expect(tocLink('Section B').getAttribute('aria-current')).toBe('location')

    // Scroll further: c reaches the offset → c becomes active.
    setTop('a', -500)
    setTop('b', -200)
    setTop('c', 80)
    fireScroll()
    expect(tocLink('Section C').getAttribute('aria-current')).toBe('location')
  })

  it('clicking a link smooth-scrolls to the heading', async () => {
    const user = userEvent.setup()
    renderToc()
    const target = document.getElementById('b') as HTMLElement
    const spy = vi.fn()
    target.scrollIntoView = spy

    const link = tocLink('Section B')
    await user.click(link)

    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('removes its scroll/resize listeners on unmount (cleanup)', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderToc()
    unmount()
    const removed = removeSpy.mock.calls.map((c) => c[0])
    expect(removed).toContain('scroll')
    expect(removed).toContain('resize')
    removeSpy.mockRestore()
  })

  it('renders nothing when there are no headings (cleared state)', () => {
    render(
      <TocProvider>
        <DocsToc />
      </TocProvider>
    )
    expect(screen.queryByText('On this page')).toBeNull()
  })
})
