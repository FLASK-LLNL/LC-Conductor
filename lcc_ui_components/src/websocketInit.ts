//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

/**
 * Client initialization state utilities.
 *
 * Provides the canonical merge of orchestrator settings with server-provided
 * defaults (APP_CONFIG) used to seed the client's initial state.
 */

import type { OrchestratorSettings } from './types.js';

/**
 * Merge saved orchestrator settings with APP_CONFIG server defaults.
 * Priority: orchestratorSettings (user overrides) > APP_CONFIG (server defaults) > undefined.
 *
 * Returns a partial OrchestratorSettings (only the core fields are populated); callers
 * layer in their own application defaults for any remaining fields.
 *
 * @param orchestratorSettings - Current orchestrator settings (backend, model, apiKey, etc.)
 * @param appConfig - Window APP_CONFIG object with server environment defaults
 * @returns Partial orchestrator settings with merged core values
 *
 * @example
 * ```typescript
 * const coreSettings = extractClientInitState(
 *   orchestratorSettings,
 *   window.APP_CONFIG
 * );
 * ```
 */
export function extractClientInitState(
  orchestratorSettings?: Partial<OrchestratorSettings>,
  appConfig?: {
    ORCHESTRATOR?: {
      backend?: string;
      model?: string;
      baseUrl?: string;
    };
  }
): Partial<OrchestratorSettings> {
  // Merge with priority: orchestratorSettings > appConfig
  // Never populate API key from appConfig (security - it's never sent from backend)
  return {
    apiKey: orchestratorSettings?.apiKey || '',
    backend: orchestratorSettings?.backend || appConfig?.ORCHESTRATOR?.backend,
    model: orchestratorSettings?.model || appConfig?.ORCHESTRATOR?.model,
    customUrl: orchestratorSettings?.customUrl || appConfig?.ORCHESTRATOR?.baseUrl,
    useCustomUrl: orchestratorSettings?.useCustomUrl ?? Boolean(appConfig?.ORCHESTRATOR?.baseUrl),
  };
}
