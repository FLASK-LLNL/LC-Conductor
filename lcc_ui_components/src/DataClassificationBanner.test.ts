//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import { describe, it, expect } from 'vitest';
import {
  resolveClassificationLevel,
  resolveClassificationPrefix,
} from './DataClassificationBanner.js';
import type { DataClassificationConfig } from './types.js';

const config: DataClassificationConfig = {
  fallbackLevel: 'UNKNOWN',
  rules: [
    { backend: 'custom', urlContains: 'internal.llnl.gov', level: 'OUO data' },
    { backend: 'custom', level: 'PUBLIC data' },
    { backend: 'livai', level: 'UNCLASSIFIED data' },
  ],
};

describe('resolveClassificationLevel', () => {
  it('matches a backend-only rule for any URL', () => {
    const result = resolveClassificationLevel('livai', 'https://anything', config);
    expect(result).toEqual({ level: 'UNCLASSIFIED data', isFallback: false });
  });

  it('matches a rule with urlContains when the URL contains the substring', () => {
    const result = resolveClassificationLevel('custom', 'https://internal.llnl.gov/v1', config);
    expect(result).toEqual({ level: 'OUO data', isFallback: false });
  });

  it('honors first-match precedence (urlContains rule beats later catch-all)', () => {
    // Both the urlContains rule and the backend-only 'custom' rule could apply;
    // the earlier one must win.
    const matching = resolveClassificationLevel('custom', 'https://internal.llnl.gov/v1', config);
    expect(matching.level).toBe('OUO data');

    // A custom URL that does NOT contain the substring falls through to the
    // backend-only 'custom' rule.
    const nonMatching = resolveClassificationLevel('custom', 'https://example.com', config);
    expect(nonMatching.level).toBe('PUBLIC data');
  });

  it('returns the fallback level when no rule matches', () => {
    const result = resolveClassificationLevel('openai', 'https://api.openai.com', config);
    expect(result).toEqual({ level: 'UNKNOWN', isFallback: true });
  });

  it('returns a fallback (and does not throw) when config is undefined', () => {
    const result = resolveClassificationLevel('livai', 'https://anything', undefined);
    expect(result.isFallback).toBe(true);
    expect(result.level.length).toBeGreaterThan(0);
  });
});

describe('resolveClassificationPrefix', () => {
  it('uses the config-supplied prefix when present', () => {
    const prefix = resolveClassificationPrefix({
      ...config,
      prefix: 'This deployment handles ',
    });
    expect(prefix).toBe('This deployment handles ');
  });

  it('falls back to the default prefix when omitted', () => {
    expect(resolveClassificationPrefix(config)).toBe(
      'Flask Copilot is approved for all levels of '
    );
  });

  it('falls back to the default prefix when config is undefined', () => {
    expect(resolveClassificationPrefix(undefined)).toBe(
      'Flask Copilot is approved for all levels of '
    );
  });
});
