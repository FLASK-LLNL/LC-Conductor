//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React from 'react';
import { BACKEND_OPTIONS } from './constants.js';
import type { BannerColor, DataClassificationConfig } from './types.js';

// Fixed lead-in; the endpoint label is appended as "[<label>]".
const STANDARD_PREFIX = 'Using this orchestrator endpoint';
const DEFAULT_MESSAGE = 'This web app can process data that is approved for ';
const DEFAULT_FALLBACK_LEVEL = 'PUBLIC RELEASE (UUR - Unclassified Unlimited Release)';

// Fixed set of colors the banner knows how to render. Values outside this set
// (e.g. from a mistyped env var) are ignored so the banner uses default styling.
const BANNER_COLORS: readonly BannerColor[] = ['green', 'yellow', 'red', 'orange'];

// Color used when a classification does not specify one (and, for the fallback,
// when no fallbackColor is set).
const DEFAULT_BANNER_COLOR: BannerColor = 'green';

const normalizeColor = (color?: string): BannerColor | undefined =>
  BANNER_COLORS.includes(color as BannerColor) ? (color as BannerColor) : undefined;

export interface DataClassificationResult {
  level: string;
  isFallback: boolean;
  color?: BannerColor;
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
    return { level: match.level, isFallback: false, color: normalizeColor(match.color) };
  }
  return { level: fallbackLevel, isFallback: true, color: normalizeColor(config.fallbackColor) };
}

/**
 * Resolve the user-configurable message segment. Uses the config-supplied
 * `prefix` when present, otherwise the built-in default.
 */
export function resolveClassificationPrefix(config?: DataClassificationConfig): string {
  return config?.prefix || DEFAULT_MESSAGE;
}

export interface DataClassificationBannerProps {
  backend: string;
  backendLabel?: string;
  url: string;
  classification?: DataClassificationConfig;
  position: 'top' | 'bottom';
  className?: string;
}

export const DataClassificationBanner: React.FC<DataClassificationBannerProps> = ({
  backend,
  backendLabel,
  url,
  classification,
  position,
  className,
}) => {
  const { level, color } = resolveClassificationLevel(backend, url, classification);
  const message = resolveClassificationPrefix(classification);

  // An explicit color takes precedence; otherwise the banner defaults to green.
  const bannerColor = color || DEFAULT_BANNER_COLOR;

  // Resolve a human label for the endpoint: explicit prop, else BACKEND_OPTIONS
  // lookup, else the raw backend value.
  const label = backendLabel || BACKEND_OPTIONS.find((o) => o.value === backend)?.label || backend;

  const classes = [
    'lcc-classification-banner',
    `lcc-classification-banner--${position}`,
    `lcc-classification-banner--${bannerColor}`,
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="note" aria-live="polite">
      {STANDARD_PREFIX} [{label}] {message}
      <strong>{level}</strong>
    </div>
  );
};
