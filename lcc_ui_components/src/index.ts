//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

// Main entry point for LC-Conductor components

// Styles
import './style.css';

// Components
export { SettingsButton } from './SettingsButton.js';
export { ReasoningSidebar, useSidebarState } from './ReasoningSidebar.js';
export { MarkdownText } from './MarkdownText.js';
export { AttachmentUpload } from './AttachmentUpload.js';
export { AgentChatPanel, AgentChatModal, AgentHistoryList } from './AgentChat.js';
export { deserializeAgentChatHistory } from './agentSerialization.js';

// Constants
export { BACKEND_OPTIONS } from './constants.js';
export { MODEL_CONTEXT_WINDOWS, contextWindowForModel } from './modelContext.js';
export {
  callLocalMcpTool,
  checkLocalMcpServerConnectivity,
  handleLocalMcpProxyRequest,
  listLocalMcpTools,
  normalizeMcpUrl,
} from './localMcp.js';

// Types
export type {
  // Settings types
  ToolServer,
  ToolServerScope,
  ToolExecutionScope,
  MCPToolDefinition,
  MCPConnectivityResult,
  ReasoningEffort,
  OrchestratorSettings,
  BackendOption,
  SettingsButtonProps,
  LocalMcpProxyRequest,
  LocalMcpProxyResponse,

  // Sidebar types
  SidebarMessage,
  SidebarState,
  SidebarProps,
  VisibleSources,
  AgentAttachment,
  AgentImageRef,
  AgentChatImageRef,
  AgentChatReasoningItem,
  AgentChatToolEvent,
  AgentChatContextItem,
  AgentChatContextUsage,
  AgentChatMessage,
  AgentChatHistory,
  AgentHistorySummary,
  SerializedAgentRuntimeConfig,
  SerializedAgentTask,
  SerializedAgentInstructionSnapshot,
  SerializedAgent,

  // Markdown types
  MarkdownTextProps,
} from './types.js';
