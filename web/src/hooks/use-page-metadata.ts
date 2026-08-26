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
import { useEffect, useRef } from 'react'

/**
 * Complete, explicitly typed page metadata managed by `usePageMetadata`.
 * All values are required except the Twitter pair, so a page can never
 * partially overwrite head state by accident.
 */
export interface PageMetadata {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogUrl: string
  canonical: string
  /** Optional Twitter card metadata; managed with identical cleanup rules. */
  twitterTitle?: string
  twitterDescription?: string
}

/**
 * Optional behaviour flag for `usePageMetadata`.
 *
 * `publicMarketingPage: true` registers the page in the public-marketing
 * lock. While any such page is mounted, `safeApplySystemName` (called by
 * the system branding bootstrap in `main.tsx`) refuses to overwrite
 * `document.title` and `meta[name="title"]`; the most recently rejected
 * system name is queued and applied automatically when the last
 * public-marketing page unmounts. Login pages, dashboard pages, and
 * other authenticated surfaces must not pass this flag — they keep the
 * admin-configured system name as their title.
 */
export interface UsePageMetadataOptions {
  publicMarketingPage?: boolean
}

// ---------------------------------------------------------------------------
// Managed head elements
//
// The hook manages a fixed set of meta and link elements, addressed by
// selector. Each target names the PageMetadata field that feeds it; a
// field that is undefined on the current owner clears the element
// (restoring the baseline state for that selector) so an optional value
// from a previous owner can never linger in the head.
// ---------------------------------------------------------------------------

interface ManagedTarget {
  selector: string
  tagName: 'meta' | 'link'
  identityAttr: 'name' | 'property' | 'rel'
  identityValue: string
  valueAttr: 'content' | 'href'
  field: keyof PageMetadata
}

const MANAGED_TARGETS: readonly ManagedTarget[] = [
  {
    selector: 'meta[name="title"]',
    tagName: 'meta',
    identityAttr: 'name',
    identityValue: 'title',
    valueAttr: 'content',
    field: 'title',
  },
  {
    selector: 'meta[name="description"]',
    tagName: 'meta',
    identityAttr: 'name',
    identityValue: 'description',
    valueAttr: 'content',
    field: 'description',
  },
  {
    selector: 'meta[property="og:title"]',
    tagName: 'meta',
    identityAttr: 'property',
    identityValue: 'og:title',
    valueAttr: 'content',
    field: 'ogTitle',
  },
  {
    selector: 'meta[property="og:description"]',
    tagName: 'meta',
    identityAttr: 'property',
    identityValue: 'og:description',
    valueAttr: 'content',
    field: 'ogDescription',
  },
  {
    selector: 'meta[property="og:url"]',
    tagName: 'meta',
    identityAttr: 'property',
    identityValue: 'og:url',
    valueAttr: 'content',
    field: 'ogUrl',
  },
  {
    selector: 'meta[name="twitter:title"]',
    tagName: 'meta',
    identityAttr: 'name',
    identityValue: 'twitter:title',
    valueAttr: 'content',
    field: 'twitterTitle',
  },
  {
    selector: 'meta[name="twitter:description"]',
    tagName: 'meta',
    identityAttr: 'name',
    identityValue: 'twitter:description',
    valueAttr: 'content',
    field: 'twitterDescription',
  },
  {
    selector: 'link[rel="canonical"]',
    tagName: 'link',
    identityAttr: 'rel',
    identityValue: 'canonical',
    valueAttr: 'href',
    field: 'canonical',
  },
]

// ---------------------------------------------------------------------------
// Baseline state
//
// Captured exactly once when the first owner registers, the baseline is
// the head state every managed selector must return to when the owner
// set becomes empty. For each selector it records whether the element
// existed before any owner mounted and, if so, its pre-mount value
// attribute. The baseline never changes afterwards.
// ---------------------------------------------------------------------------

type BaselineElementState =
  | { kind: 'absent' }
  | { kind: 'present'; hadAttribute: boolean; value: string | null }

interface BaselineState {
  title: string
  elements: Map<string, BaselineElementState>
}

let baseline: BaselineState | null = null

/**
 * Nodes the registry itself created, keyed by selector. Only these
 * exact nodes may be removed when a selector reverts to the
 * "absent" baseline state; an element that other code inserted at the
 * same selector during the lifecycle is never touched.
 */
const createdNodes = new Map<string, HTMLMetaElement | HTMLLinkElement>()

function captureBaseline(): BaselineState {
  const elements = new Map<string, BaselineElementState>()
  for (const target of MANAGED_TARGETS) {
    const existing = document.head.querySelector<
      HTMLMetaElement | HTMLLinkElement
    >(target.selector)
    if (!existing) {
      elements.set(target.selector, { kind: 'absent' })
      continue
    }
    const hadAttribute = existing.hasAttribute(target.valueAttr)
    const value = hadAttribute ? existing.getAttribute(target.valueAttr) : null
    elements.set(target.selector, { kind: 'present', hadAttribute, value })
  }
  return { title: document.title, elements }
}

// ---------------------------------------------------------------------------
// Per-element write paths
// ---------------------------------------------------------------------------

/**
 * Set one managed element to a concrete value. The registry's own
 * stored node reference is always preferred over a selector query, so
 * a third-party node at the same selector — even one positioned before
 * the registry node in the head — is never written to.
 */
function setElementValue(target: ManagedTarget, value: string): void {
  const own = createdNodes.get(target.selector)
  if (own && own.isConnected) {
    own.setAttribute(target.valueAttr, value)
    return
  }
  const state = baseline?.elements.get(target.selector)
  if (state?.kind !== 'present') {
    // Baseline absent: the registry owns this selector. When a node it
    // created earlier was detached by other code, recreate a fresh one;
    // never write into a third-party node at the same selector.
    const created = document.createElement(target.tagName)
    created.setAttribute(target.identityAttr, target.identityValue)
    created.setAttribute(target.valueAttr, value)
    document.head.appendChild(created)
    createdNodes.set(target.selector, created)
    return
  }
  // Baseline present: manage the element currently at the selector.
  let element = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(
    target.selector
  )
  if (!element) {
    element = document.createElement(target.tagName)
    element.setAttribute(target.identityAttr, target.identityValue)
    document.head.appendChild(element)
  }
  element.setAttribute(target.valueAttr, value)
}

/**
 * Revert one managed selector to its baseline state: restore the
 * baseline value when the baseline had the element, otherwise remove
 * the registry's own node — addressed by its stored reference, never
 * by a selector query, so same-selector nodes inserted by other code
 * are never removed no matter where they sit in the head.
 */
function restoreElementToBaseline(target: ManagedTarget): void {
  const state = baseline?.elements.get(target.selector)
  if (state && state.kind === 'present') {
    let element = document.head.querySelector<
      HTMLMetaElement | HTMLLinkElement
    >(target.selector)
    if (!element) {
      element = document.createElement(target.tagName)
      element.setAttribute(target.identityAttr, target.identityValue)
      document.head.appendChild(element)
    }
    if (state.hadAttribute) {
      element.setAttribute(target.valueAttr, state.value ?? '')
    } else {
      element.removeAttribute(target.valueAttr)
    }
    return
  }
  const created = createdNodes.get(target.selector)
  createdNodes.delete(target.selector)
  if (created && created.isConnected) {
    created.remove()
  }
}

/** Apply the full metadata of one owner to the head. */
function applyMetadataToHead(metadata: PageMetadata): void {
  document.title = metadata.title
  for (const target of MANAGED_TARGETS) {
    const value = metadata[target.field]
    if (value === undefined) {
      restoreElementToBaseline(target)
    } else {
      setElementValue(target, value)
    }
  }
}

/** Restore every managed selector to the captured baseline. */
function restoreBaselineToHead(): void {
  if (!baseline) return
  document.title = baseline.title
  for (const target of MANAGED_TARGETS) {
    restoreElementToBaseline(target)
  }
}

// ---------------------------------------------------------------------------
// Owner registry
//
// Each component instance registers exactly one owner, identified by a
// unique Symbol token — never by the PageMetadata reference, so two
// hooks that pass the same metadata constant are still two distinct
// owners. Registration happens once on mount and removal once on
// unmount; metadata updates mutate the registered record IN PLACE and
// therefore never change the owner's position in mount order.
//
// The head always reflects the last surviving owner in mount order
// (Map iteration is insertion order). When the registry is empty the
// head returns to the baseline.
// ---------------------------------------------------------------------------

type OwnerToken = symbol

interface OwnerRecord {
  metadata: PageMetadata
  publicMarketingPage: boolean
}

const owners = new Map<OwnerToken, OwnerRecord>()

/** Apply the last surviving owner's metadata, or the baseline. */
function applyCurrentOwner(): void {
  let last: OwnerRecord | undefined
  for (const record of owners.values()) {
    last = record
  }
  if (last) {
    applyMetadataToHead(last.metadata)
  } else {
    restoreBaselineToHead()
  }
}

// ---------------------------------------------------------------------------
// Public-marketing lock and deferred system name
//
// While the counter is positive, safeApplySystemName queues the name
// instead of writing it; the queued name is applied the moment the
// counter returns to zero. A counter (not a boolean) is required
// because several public-marketing pages can be mounted at the same
// time (StrictMode double-mount, route transitions).
// ---------------------------------------------------------------------------

let publicMarketingMountCount = 0
let pendingSystemName: string | null = null

/**
 * Whether any public marketing page is currently mounted. Read by the
 * branding bootstrap in main.tsx before it touches `document.title` or
 * `meta[name="title"]`.
 */
export function isPublicMarketingMetadataActive(): boolean {
  return publicMarketingMountCount > 0
}

/**
 * Apply the admin's system name to the title and the `name="title"`
 * meta only. Does not touch any other managed element, so the
 * route-level description, OG, Twitter, and canonical are not
 * clobbered.
 */
function applySystemNameToHead(systemName: string): void {
  if (typeof document === 'undefined') return
  document.title = systemName
  let titleMeta =
    document.head.querySelector<HTMLMetaElement>('meta[name="title"]')
  if (!titleMeta) {
    titleMeta = document.createElement('meta')
    titleMeta.setAttribute('name', 'title')
    document.head.appendChild(titleMeta)
  }
  titleMeta.setAttribute('content', systemName)
}

/** Decrement the lock and flush the queued system name when it frees. */
function releasePublicMarketingLock(): void {
  publicMarketingMountCount = Math.max(0, publicMarketingMountCount - 1)
  if (publicMarketingMountCount === 0 && pendingSystemName !== null) {
    const queued = pendingSystemName
    pendingSystemName = null
    applySystemNameToHead(queued)
  }
}

/**
 * Apply the admin's `system_name` to `document.title` and
 * `meta[name="title"]` — but only when no public marketing page is
 * currently mounted. The branding IIFE in `main.tsx` calls this
 * function instead of touching the head directly, so route-level
 * metadata always wins on the marketing pages while authenticated
 * pages and login pages keep the system name.
 *
 * If a public marketing page IS mounted, the most recent system name
 * is queued and applied automatically when the last one unmounts.
 * An empty / non-string `systemName` is a no-op.
 */
export function safeApplySystemName(systemName: unknown): void {
  if (typeof systemName !== 'string' || systemName.length === 0) return
  if (typeof document === 'undefined') return

  if (isPublicMarketingMetadataActive()) {
    pendingSystemName = systemName
    return
  }

  pendingSystemName = null
  applySystemNameToHead(systemName)
}

// ---------------------------------------------------------------------------
// Test-only escape hatch
// ---------------------------------------------------------------------------

/**
 * Reset the owner registry, the baseline, the created-node ledger, the
 * public-marketing lock counter, and the pending system name.
 * Production code never needs this; it is exported solely for the test
 * setup so unrelated cases cannot leak a held lock or owner.
 */
export function resetMetadataRegistry(): void {
  owners.clear()
  baseline = null
  createdNodes.clear()
  publicMarketingMountCount = 0
  pendingSystemName = null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manage document metadata for one page.
 *
 * Two effects with two distinct jobs:
 *
 * 1. MOUNT LIFECYCLE (deps: none). Runs once per component instance:
 *    creates the owner token, captures the baseline if this is the
 *    first owner, registers the record, acquires the public-marketing
 *    lock if requested, and applies the head. The cleanup unregisters
 *    the owner, releases the lock, and re-applies the new last
 *    surviving owner (or the baseline).
 *
 * 2. METADATA UPDATES (deps: metadata, publicMarketingPage). Mutates
 *    the registered record IN PLACE and, when something actually
 *    changed, re-applies the head; the lock adjustment runs afterwards
 *    so a queued-system-name flush on the final unlock is the last
 *    title write. The owner is never removed and re-inserted, so a
 *    metadata update cannot change mount order, and unrelated
 *    re-renders that pass a memoized metadata reference never run this
 *    effect at all.
 *
 * Pages must memoize their metadata on `i18n.language` so unrelated
 * re-renders (theme, data refresh, auth state) keep the reference —
 * and therefore the head — stable.
 */
export function usePageMetadata(
  metadata: PageMetadata,
  options: UsePageMetadataOptions = {}
): void {
  const { publicMarketingPage = false } = options

  const tokenRef = useRef<OwnerToken | null>(null)
  const recordRef = useRef<OwnerRecord>({ metadata, publicMarketingPage })
  const lockHeldRef = useRef(false)

  useEffect(() => {
    const token = Symbol('usePageMetadata.owner')
    tokenRef.current = token
    if (owners.size === 0) {
      baseline = captureBaseline()
    }
    owners.set(token, recordRef.current)
    if (recordRef.current.publicMarketingPage) {
      publicMarketingMountCount += 1
      lockHeldRef.current = true
    }
    applyCurrentOwner()

    return () => {
      tokenRef.current = null
      owners.delete(token)
      applyCurrentOwner()
      if (lockHeldRef.current) {
        lockHeldRef.current = false
        releasePublicMarketingLock()
      }
    }
  }, [])

  useEffect(() => {
    const record = recordRef.current
    // On the very first run (right after the mount effect registered
    // the record) nothing has changed, so the head is not re-applied a
    // second time.
    const changed =
      record.metadata !== metadata ||
      record.publicMarketingPage !== publicMarketingPage
    record.metadata = metadata
    record.publicMarketingPage = publicMarketingPage
    if (changed) {
      applyCurrentOwner()
    }
    // Lock adjustment runs AFTER the head reflects the record, so the
    // queued-system-name flush on the final unlock is the last title
    // write — the owner's title is never re-applied on top of it.
    if (publicMarketingPage && !lockHeldRef.current) {
      publicMarketingMountCount += 1
      lockHeldRef.current = true
    } else if (!publicMarketingPage && lockHeldRef.current) {
      lockHeldRef.current = false
      releasePublicMarketingLock()
    }
  }, [metadata, publicMarketingPage])
}
