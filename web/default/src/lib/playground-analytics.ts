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

/**
 * Per-request funnel tracker for the playground (default theme).
 *
 * Mirrors the classic theme's `src/helpers/playground-analytics.js` design.
 * Each call to `start()` creates a fresh, isolated handle for one request;
 * async callbacks close over their own handle so concurrent requests A and B
 * can never cross-contaminate each other's `model`/`endpoint_type`.
 *
 * Handle state machine (starts at `'pending'`):
 *   success() : pending -> success   -> emits 'playground_request_succeeded'
 *   fail()    : pending -> failed    -> emits nothing
 *   cancel()  : pending -> cancelled -> emits nothing
 *   Subsequent calls after leaving `pending` are no-ops, so a late success()
 *   after fail()/cancel() is safely dropped.
 *
 * `start()` emits 'playground_request_started' immediately. Only
 * { model, endpoint_type } are ever recorded — never prompts, messages, images
 * or files.
 */

export interface PlaygroundRequestHandle {
  /** Record a genuine success. No-op after an earlier call or after fail/cancel. */
  success(): void;
  /** Record a terminal failure (HTTP/SSE/parse error). Ignores late calls. */
  fail(): void;
  /** Record a user-initiated cancellation. Ignores late calls. */
  cancel(): void;
}

export interface PlaygroundAnalytics {
  start(
    model: string | null,
    endpointType: string | null,
  ): PlaygroundRequestHandle;
}

export function createPlaygroundAnalytics(
  trackEvent: (
    eventName: string,
    eventData?: Record<string, string | number | boolean>,
  ) => void,
): PlaygroundAnalytics {
  function start(
    model: string | null,
    endpointType: string | null,
  ): PlaygroundRequestHandle {
    const meta = {
      model: model != null && model !== '' ? model : null,
      endpointType:
        endpointType != null && endpointType !== '' ? endpointType : null,
    };

    let phase: 'pending' | 'success' | 'failed' | 'cancelled' = 'pending';

    if (meta.model != null) {
      trackEvent('playground_request_started', {
        model: meta.model,
        ...(meta.endpointType != null
          ? { endpoint_type: meta.endpointType }
          : {}),
      })
    }

    return {
      success() {
        if (phase !== 'pending') return;
        phase = 'success';
        if (meta.model != null) {
          trackEvent('playground_request_succeeded', {
            model: meta.model,
            ...(meta.endpointType != null
              ? { endpoint_type: meta.endpointType }
              : {}),
          })
        }
      },
      fail() {
        if (phase !== 'pending') return;
        phase = 'failed';
      },
      cancel() {
        if (phase !== 'pending') return;
        phase = 'cancelled';
      },
    };
  }

  return { start };
}
