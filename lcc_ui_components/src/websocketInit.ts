//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

/**
 * WebSocket initialization utilities for secure client state handshake.
 *
 * This module provides functions to securely send initial client state
 * to the backend via WebSocket data (not query params or headers) which
 * is more secure as it won't be logged in HTTP access logs.
 */

export interface ClientInitState {
  /** Whether a service API key is available from server environment */
  hasServiceApiKey: boolean;
  /** Cached API key from client storage (if any) */
  apiKey?: string;
  /** Selected backend from browser state */
  backend?: string;
  /** Selected model from browser state */
  model?: string;
  /** Custom base URL from browser state */
  baseUrl?: string;
  /** Whether using custom URL */
  useCustomUrl?: boolean;
  /** Any additional initial state */
  [key: string]: any;
}

/**
 * Create a client initialization message to be sent as the first WebSocket message.
 *
 * This is the most secure way to send initial state including sensitive data like
 * API keys, as WebSocket data is not logged in HTTP access logs.
 *
 * @param state - Initial client state to send to backend
 * @returns JSON string ready to send via WebSocket
 *
 * @example
 * ```typescript
 * socket.onopen = () => {
 *   const initMessage = createClientInitMessage({
 *     hasServiceApiKey: window.APP_CONFIG?.ORCHESTRATOR?.hasServiceApiKey || false,
 *     apiKey: settings.apiKey || '',
 *   });
 *   socket.send(initMessage);
 * };
 * ```
 */
export function createClientInitMessage(state: ClientInitState): string {
  return JSON.stringify({
    action: 'client-init',
    ...state,
  });
}

/**
 * Send client initialization as the first WebSocket message.
 *
 * This should be called in the socket.onopen handler before any other messages.
 *
 * @param socket - WebSocket connection
 * @param state - Initial client state
 *
 * @example
 * ```typescript
 * socket.onopen = () => {
 *   sendClientInit(socket, {
 *     hasServiceApiKey: window.APP_CONFIG?.ORCHESTRATOR?.hasServiceApiKey || false,
 *     apiKey: settings.apiKey || '',
 *   });
 *   // ... other initialization
 * };
 * ```
 */
export function sendClientInit(socket: WebSocket, state: ClientInitState): void {
  socket.send(createClientInitMessage(state));
}

/**
 * Extract client init state from orchestrator config and settings.
 * Helper function to gather the standard init state.
 *
 * @param orchestratorSettings - Current orchestrator settings (backend, model, apiKey, etc.)
 * @param appConfig - Window APP_CONFIG object
 * @returns Client init state ready to send
 *
 * @example
 * ```typescript
 * socket.onopen = () => {
 *   const initState = extractClientInitState(
 *     orchestratorSettings,
 *     window.APP_CONFIG
 *   );
 *   sendClientInit(socket, initState);
 * };
 * ```
 */
export function extractClientInitState(
  orchestratorSettings?: {
    apiKey?: string;
    backend?: string;
    model?: string;
    customUrl?: string;
    useCustomUrl?: boolean;
  },
  appConfig?: {
    ORCHESTRATOR?: {
      hasServiceApiKey?: boolean | string;
    };
  }
): ClientInitState {
  return {
    hasServiceApiKey: Boolean(appConfig?.ORCHESTRATOR?.hasServiceApiKey),
    apiKey: orchestratorSettings?.apiKey || '',
    backend: orchestratorSettings?.backend,
    model: orchestratorSettings?.model,
    baseUrl: orchestratorSettings?.customUrl,
    useCustomUrl: orchestratorSettings?.useCustomUrl,
  };
}
