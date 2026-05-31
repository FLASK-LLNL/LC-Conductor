//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import type { DiscoverModelsRequest, DiscoverModelsResponse } from './types.js';

/**
 * Discover available models for a backend by calling the API endpoint.
 *
 * @param httpServerUrl - Base URL of the HTTP server
 * @param request - Request parameters including backend, optional base_url, and optional api_key
 * @returns Promise resolving to the list of models and their source
 *
 * @example
 * ```typescript
 * const result = await discoverModels('http://localhost:8001', {
 *   backend: 'openai',
 *   base_url: 'https://api.openai.com/v1',
 *   api_key: 'sk-...'
 * });
 * console.log(result.models); // ['gpt-4', 'gpt-3.5-turbo', ...]
 * console.log(result.source); // 'discovered' or 'default'
 * ```
 */
export async function discoverModels(
  httpServerUrl: string,
  request: DiscoverModelsRequest
): Promise<DiscoverModelsResponse> {
  const response = await fetch(`${httpServerUrl}/api/discover-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to discover models: ${response.status}`);
  }

  return response.json();
}
