//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

export const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = Object.freeze({
  'gpt-5.5': 400_000,
  'gpt-5.4': 400_000,
  'gpt-5.2': 400_000,
  'gpt-5.1': 400_000,
  'gpt-5-mini': 400_000,
  'gpt-5-nano': 400_000,
  'gpt-5': 400_000,
  'gpt-4.1': 1_047_576,
  'gpt-4o': 128_000,
  'gpt-4': 128_000,
  o4: 200_000,
  o3: 200_000,
  claude: 192_000,
  'gemini-1.5': 1_000_000,
  'gemini-2.0': 1_000_000,
  gemini: 1_000_000,
  'gpt-oss': 128_000,
  llama: 128_000,
});

export const contextWindowForModel = (model: unknown): number | undefined => {
  if (typeof model !== 'string' || model.trim().length === 0) {
    return undefined;
  }

  const normalizedModel = model.toLowerCase();
  for (const [modelPrefix, contextWindow] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (normalizedModel.startsWith(modelPrefix) || normalizedModel.endsWith(modelPrefix)) {
      return contextWindow;
    }
  }

  if (normalizedModel.includes('/')) {
    const shortModel = normalizedModel.split('/').pop();
    if (shortModel) {
      for (const [modelPrefix, contextWindow] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (shortModel.startsWith(modelPrefix) || shortModel.endsWith(modelPrefix)) {
          return contextWindow;
        }
      }
    }
  }

  return undefined;
};
