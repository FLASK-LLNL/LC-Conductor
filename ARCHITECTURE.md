# Architecture Specification

## Purpose

LC-Conductor provides shared orchestration infrastructure for FLASK-style agent applications. It contains a Python package for backend task management, MCP tool registration, and local MCP proxying, plus a React component library used by parent applications.

This repository is consumed as a submodule by FLASK Copilot. Keep generic orchestration behavior here; keep chemistry-specific behavior in the parent repository.

## Package Layout

- `lc_conductor/`: Python package.
- `lc_conductor/backend_manager.py`: connection-scoped task and action management.
- `lc_conductor/tool_registration.py`: MCP server registration, validation, persistence, and tool discovery.
- `lc_conductor/tooling.py`: normalized tool descriptors and runtime models for selected tools.
- `lc_conductor/local_mcp_proxy.py`: WebSocket bridge for browser-local MCP servers.
- `lc_conductor/callback_logger.py`: callback logging to WebSocket clients.
- `lc_conductor/backend_helper_function.py`: shared run settings and process executor helpers.
- `lcc_ui_components/src/`: reusable React components and browser helpers.
- `tests/`: Python tests for orchestration behavior.

## Backend Runtime Model

The central backend abstraction is `TaskManager`. A parent application creates one instance per WebSocket connection. It owns the active asyncio task, a process pool executor, callback logger, configured tool servers, discovered local MCP tools, and the currently selected `ToolRuntime`.

`ActionManager` is the generic action layer. Parent applications subclass it when they need domain-specific actions. It owns save/load experiment state, run settings, backend/model configuration, selected tool runtime construction, MCP server checks, and common response formatting.

The parent application is responsible for calling the right `ActionManager` handler from its WebSocket message loop. LC-Conductor is responsible for generic safety around cancellation, tool resolution, background task failure reporting, and common websocket responses.

## Tool Architecture

Tool data is normalized in `tooling.py`.

- `ToolServerConfig` describes an external MCP server and whether it runs in backend or local scope.
- `MCPToolDefinition` describes tools discovered from MCP servers.
- `BuiltinToolDefinition` describes Python callables supplied by the parent app.
- `ToolDescriptor` is the frontend/backend selection shape.
- `ToolRuntime` is the final executable selection, including bearer token and selected tools.

`tool_registration.py` owns backend-visible MCP servers. It validates endpoints, reloads persisted server lists, checks connectivity, lists tools, and exposes helpers used by parent FastAPI routes.

`local_mcp_proxy.py` owns browser-local MCP servers. It sends proxy requests over the existing app WebSocket, tracks pending calls by request id, resolves client responses, and exposes local tools as direct built-in callables for ChARGe agents.

## Frontend Component Library

`lcc_ui_components` builds a Vite library exported as `lc-conductor`. Important modules:

- `SettingsButton.tsx`: backend/model and orchestrator settings UI.
- `ReasoningSidebar.tsx`: displays reasoning/progress history.
- `AttachmentUpload.tsx`: shared upload control.
- `MarkdownText.tsx`: markdown rendering.
- `localMcp.ts`: browser-side MCP discovery and proxy helpers.
- `types.ts`, `constants.ts`, `api.ts`: shared contracts.

Parent applications import both components and styles, for example `import 'lc-conductor/styles'`.

## Extension Points

Add new generic action behavior to `ActionManager` only when it can be reused across parent apps. Add parent-specific behavior by subclassing `ActionManager`. Add new shared UI only if it has no domain assumptions. Keep file dependencies acyclic: parent apps may import LC-Conductor; LC-Conductor must not import parent app modules.

## Debugging Guide

- Background task cancellation or stuck completion: inspect `TaskManager.run_task`, `cancel_current_task`, and `_handle_task_done`.
- Missing backend MCP tools: inspect `tool_registration.py`, persisted server cache, bearer token handling, and `list_server_tools`.
- Missing local MCP tools: inspect `local_mcp_proxy.py` request ids and frontend `localMcp.ts`.
- Wrong selected tools: inspect `ToolRuntime` construction in `ActionManager`.
- UI component build issues: run `cd lcc_ui_components && npm run build` and inspect exported symbols in `src/index.ts`.
