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
  scope?: ToolServerScope;
}

export type ToolServerScope = 'backend' | 'local';
export type ToolExecutionScope = 'backend' | 'local';

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPConnectivityResult {
  status: 'connected' | 'disconnected';
  url?: string;
  tools?: MCPToolDefinition[];
  error?: string;
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface OrchestratorSettings {
  backend: string;
  useCustomUrl: boolean;
  customUrl?: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  useCustomModel?: boolean;
  apiKey?: string;
  backendLabel: string;
  toolServers?: ToolServer[];
}

export interface BackendOption {
  value: string;
  label: string;
  defaultUrl: string;
  models: string[];
}

// Fixed palette of banner colors selectable per classification.
export type BannerColor = 'green' | 'yellow' | 'red' | 'orange';

export interface DataClassificationRule {
  // Backend value this rule applies to (matches OrchestratorSettings.backend).
  backend: string;
  // Optional substring match against the resolved endpoint URL. When present,
  // the rule only matches if the URL contains this substring.
  urlContains?: string;
  // The "XXX" text inserted into "This web app is approved for all levels of XXX".
  level: string;
  // Optional banner color for this classification. When omitted, the banner
  // uses its default styling.
  color?: BannerColor;
}

export interface DataClassificationConfig {
  // Rules evaluated top-to-bottom; first match wins.
  rules: DataClassificationRule[];
  // Level text used when no rule matches the current backend + URL.
  fallbackLevel: string;
  // Optional user-configurable message rendered after the fixed lead-in
  // ("Using this orchestrator endpoint [<label>] ") and before the resolved
  // level. When omitted, the banner falls back to its built-in default
  // ("This web app can process data that is approved for ").
  prefix?: string;
  // Optional banner color used when no rule matches (the fallback level). When
  // omitted, the banner uses its default color (green).
  fallbackColor?: BannerColor;
}

export interface DiscoverModelsRequest {
  backend: string;
  base_url?: string;
  api_key?: string;
}

export interface DiscoverModelsResponse {
  backend: string;
  models: string[];
  source: 'discovered' | 'default';
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
}

export interface LocalMcpProxyRequest {
  requestId?: string;
  requestKind?: 'list-tools' | 'call-tool';
  servers?: string[];
  serverUrl?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
}

export interface LocalMcpProxyResponse {
  action: 'local-mcp-response';
  requestId: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Sidebar Types
// ============================================================================

export interface SidebarMessage {
  id: number;
  timestamp?: number;
  message: string;
  smiles: string | null;
  source: string;
  agentKey?: string;
  eventKind?: AgentChatEventKind;
  title?: string;
  instructions?: AgentChatContextItem[] | string;
  // Server -> browser preview refs only. The browser resolves data URLs from
  // the Agent experiment context so base64 image bytes are not duplicated here.
  images?: Record<string, AgentImageRef>;
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
  resolveImageDataUrl?: (imageId: string) => string | undefined;
}

// ============================================================================
// Attachment Types
// ============================================================================

export interface AgentAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: string;
}

export interface AgentImageRef {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

// ============================================================================
// Agent Chat Types
// ============================================================================

export interface AgentChatImageRef extends AgentImageRef {
  dataUrl?: string;
}

export interface AgentChatReasoningItem {
  type: string;
  text: string;
  debug?: unknown;
}

export interface AgentChatToolEvent {
  type: string;
  name?: string;
  text: string;
  raw?: unknown;
}

export interface AgentChatContextItem {
  title: string;
  text: string;
}

export type AgentChatEventKind = 'reasoning' | 'tool_call' | 'tool_result' | 'status';

export interface AgentChatContextUsage {
  usedTokens: number;
  maxTokens?: number;
  source: 'provider';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  label?: string;
  text: string;
  pending?: boolean;
  eventKind?: AgentChatEventKind;
  context?: AgentChatContextItem[];
  images?: AgentChatImageRef[];
  reasoning?: AgentChatReasoningItem[];
  toolEvents?: AgentChatToolEvent[];
  raw?: unknown;
}

export interface AgentChatHistory {
  agentKey: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
  modelInfo?: Record<string, unknown>;
  contextUsage?: AgentChatContextUsage;
  promptContext?: AgentChatContextItem[];
  messages: AgentChatMessage[];
  lastMessage?: string;
  rawSession?: unknown;
}

export type AgentHistorySummary = AgentChatHistory;

export interface SerializedAgentRuntimeConfig {
  backend?: string;
  model?: string;
}

export interface SerializedAgentTask {
  system_prompt?: string;
  user_prompt?: string;
}

export interface SerializedAgentInstructionSnapshot {
  messageCount: number;
  instructions: string;
}

export interface SerializedAgentPendingUserMessage {
  text: string;
  afterMessageCount?: number;
  images?: AgentChatImageRef[];
}

export interface SerializedAgent {
  runtimeConfig?: SerializedAgentRuntimeConfig;
  memory?: string;
  modelInfo?: Record<string, unknown>;
  task?: SerializedAgentTask | null;
  instructionHistory?: SerializedAgentInstructionSnapshot[];
  pendingUserMessage?: SerializedAgentPendingUserMessage | null;
}

// ============================================================================
// Markdown Types
// ============================================================================

export interface MarkdownTextProps {
  text: string;
  className?: string;
  collapsibleCodeBlocks?: boolean;
  defaultCollapsedCodeBlocks?: boolean;
  codeBlockCollapseThreshold?: number;
}
