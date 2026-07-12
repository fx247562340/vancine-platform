/*
Copyright (C) 2025 QuantumNous

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
 * Pure, React-free core of the playground request funnel tracker.
 *
 * Factored out of the useApiRequest hook so its per-request state machine can
 * be unit tested without rendering a component. Each call to `start` returns a
 * dedicated handle for exactly one request; holds capture the handle in their
 * own closure so concurrent requests never cross-contaminate.
 *
 * State machine of one handle (starts at 'pending'):
 *   success() : pending -> success  -> emits 'playground_request_succeeded'
 *   fail()    : pending -> failed   -> emits nothing
 *   cancel()  : pending -> cancelled -> emits nothing
 *   Any further call after leaving 'pending' is a no-op, so a late success()
 *   after fail()/cancel() is safely ignored.
 *
 * start() must only fire 'playground_request_started'. Only { model,
 * endpoint_type } are ever recorded — never prompts, messages, images or files.
 *
 * @param {(eventName: string, eventData?: unknown) => void} trackEvent -
 *   Umami analytics callback.
 * @returns {{ start(model: string|null, endpointType:
 *   string|null): RequestHandle }}
 */
export function createPlaygroundAnalytics(trackEvent) {
  /**
   * @param {string|null} model
   * @param {string|null} endpointType
   * @returns {RequestHandle}
   */
  function start(model, endpointType) {
    const meta = {
      model: model != null && model !== '' ? model : null,
      endpointType:
        endpointType != null && endpointType !== '' ? endpointType : null,
    };
    let phase = 'pending'; // 'pending' | 'success' | 'failed' | 'cancelled'

    if (meta.model != null) {
      trackEvent('playground_request_started', {
        model: meta.model,
        endpoint_type: meta.endpointType,
      });
    }

    function success() {
      if (phase !== 'pending') return;
      phase = 'success';
      if (meta.model != null) {
        trackEvent('playground_request_succeeded', {
          model: meta.model,
          endpoint_type: meta.endpointType,
        });
      }
    }

    function fail() {
      if (phase !== 'pending') return;
      phase = 'failed';
    }

    function cancel() {
      if (phase !== 'pending') return;
      phase = 'cancelled';
    }

    return { success, fail, cancel };
  }

  return { start };
}
