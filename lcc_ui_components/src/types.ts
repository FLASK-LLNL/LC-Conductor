//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import { Dispatch, SetStateAction } from 'react';

// ============================================================================
// Settings Types
// ============================================================================

export interface ToolServer {
  id: string;
  url: string;
  name?: string; // Optional display name
}

export interface CurlExecutionResult {
  success: boolean;
  status_code?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
  execution_time_ms?: number;
  timestamp: string;  // When executed
}

export interface HpcAllocation {
  id: string;
  system: string;
  nodes: number;
  time: string;
  bank: string;
}

export interface HpcAllocationRequestMessage {
  type: 'allocate-hpc-resources';
  requestId: string;
  allocation: {
    system: string;
    nodes: number;
    time: string;
    bank: string;
  };
}

export interface HpcAllocationResultMessage {
  type: 'allocate-hpc-resources-result';
  requestId: string;
  allocation: {
    system: string;
    nodes: number;
    time: string;
    bank: string;
  };
  executedCurl?: string;
  result: CurlExecutionResult;
}

export interface OrchestratorSettings {
  backend: string;
  useCustomUrl: boolean;
  customUrl?: string;
  model: string;
  useCustomModel?: boolean;
  apiKey: string;
  backendLabel: string;
  toolServers?: ToolServer[];
  hpcAllocations?: HpcAllocation[];
}

export interface BackendOption {
  value: string;
  label: string;
  defaultUrl: string;
  models: string[];
}

export interface MoleculeNameOption {
  value: string;
  label: string;
}

export interface SettingsButtonProps {
  onClick?: () => void;
  onSettingsChange?: (settings: OrchestratorSettings) => void;
  onServerAdded?: () => void;
  onServerRemoved?: () => void;
  initialSettings?: Partial<OrchestratorSettings>;
  username?: string;
  className?: string;
  httpServerUrl: string;
  websocket?: WebSocket;
}

// ============================================================================
// Sidebar Types
// ============================================================================

export interface SidebarMessage {
  id: number;
  timestamp: string;
  message: string;
  smiles: string | null;
  source: string;
}

export interface VisibleSources {
  [key: string]: boolean;
}

export interface SidebarState {
  messages: SidebarMessage[];
  setMessages: Dispatch<SetStateAction<SidebarMessage[]>>;
  sourceFilterOpen: boolean;
  setSourceFilterOpen: Dispatch<SetStateAction<boolean>>;
  visibleSources: VisibleSources;
  setVisibleSources: Dispatch<SetStateAction<VisibleSources>>;
}

export interface SidebarProps extends SidebarState {
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  rdkitModule?: any; // Optional RDKit module (for backwards compatibility)
}

// ============================================================================
// Markdown Types
// ============================================================================

export interface MarkdownTextProps {
  text: string;
  className?: string;
}
