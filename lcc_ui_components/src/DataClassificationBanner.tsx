//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React from 'react';
import type { DataClassificationConfig } from './types.js';

const DEFAULT_PREFIX = 'Flask Copilot is approved for all levels of ';
const DEFAULT_FALLBACK_LEVEL = 'an UNKNOWN classification — verify before sending data';

export interface DataClassificationResult {
  level: string;
  isFallback: boolean;
}

/**
 * Resolve the classification "level" text for the current backend + URL.
 *
 * Rules are evaluated top-to-bottom; the first rule whose `backend` matches and
 * whose optional `urlContains` substring is present in `url` wins. When nothing
 * matches (or no config is provided) the config's `fallbackLevel` is returned
 * and `isFallback` is true.
 */
export function resolveClassificationLevel(
  backend: string,
  url: string,
  config?: DataClassificationConfig
): DataClassificationResult {
  const fallbackLevel = config?.fallbackLevel || DEFAULT_FALLBACK_LEVEL;
  if (!config || !Array.isArray(config.rules)) {
    return { level: fallbackLevel, isFallback: true };
  }
  const match = config.rules.find(
    (rule) =>
      rule.backend === backend && (rule.urlContains ? (url || '').includes(rule.urlContains) : true)
  );
  if (match) {
    return { level: match.level, isFallback: false };
  }
  return { level: fallbackLevel, isFallback: true };
}

/**
 * Resolve the banner sentence prefix. Uses the config-supplied `prefix` when
 * present, otherwise the built-in default.
 */
export function resolveClassificationPrefix(config?: DataClassificationConfig): string {
  return config?.prefix || DEFAULT_PREFIX;
}

export interface DataClassificationBannerProps {
  backend: string;
  url: string;
  classification?: DataClassificationConfig;
  position: 'top' | 'bottom';
  className?: string;
}

export const DataClassificationBanner: React.FC<DataClassificationBannerProps> = ({
  backend,
  url,
  classification,
  position,
  className,
}) => {
  const { level, isFallback } = resolveClassificationLevel(backend, url, classification);
  const prefix = resolveClassificationPrefix(classification);

  const classes = [
    'lcc-classification-banner',
    `lcc-classification-banner--${position}`,
    isFallback ? 'lcc-classification-banner--caution' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="note" aria-live="polite">
      {prefix}
      <strong>{level}</strong>
    </div>
  );
};
