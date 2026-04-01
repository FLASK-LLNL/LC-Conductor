//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React from 'react';
import { Plus, Trash2, Edit2, Loader2, Settings, Wrench } from 'lucide-react';
import type {
  MCPConnectivityResult,
  OrchestratorSettings,
  ReasoningEffort,
  ToolServer,
  ToolServerScope,
  SettingsButtonProps,
} from './types.js';
import { BACKEND_OPTIONS } from './constants.js';
import { checkLocalMcpServerConnectivity } from './localMcp.js';

const normalizeToolServers = (settings?: Partial<OrchestratorSettings>): ToolServer[] => {
  const nextServers: ToolServer[] = [];
  const seen = new Set<string>();

  const addServer = (server: ToolServer, fallbackScope: ToolServerScope) => {
    const scope = server.scope === 'local' ? 'local' : fallbackScope;
    const key = `${scope}:${server.url}`;
    if (!server.url || seen.has(key)) {
      return;
    }
    seen.add(key);
    nextServers.push({ ...server, scope });
  };

  (settings?.toolServers || []).forEach((server) => addServer(server, server.scope || 'backend'));

  return nextServers;
};

const normalizeSettings = (settings?: Partial<OrchestratorSettings>): OrchestratorSettings => ({
  backend: 'openai',
  backendLabel: 'OpenAI',
  useCustomUrl: false,
  customUrl: '',
  model: 'gpt-5.4',
  reasoningEffort: 'medium',
  useCustomModel: false,
  apiKey: '',
  ...settings,
  toolServers: normalizeToolServers(settings),
});

export const SettingsButton: React.FC<SettingsButtonProps> = ({
  onClick,
  onSettingsChange,
  onServerAdded,
  onServerRemoved,
  initialSettings,
  username,
  httpServerUrl,
  className = '',
}) => {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'orchestrator' | 'tools'>('orchestrator');
  // Cache for storing backend-specific settings
  const [backendCache, setBackendCache] = React.useState<
    Record<
      string,
      {
        customUrl: string;
        model: string;
        reasoningEffort: ReasoningEffort;
        useCustomModel: boolean;
      }
    >
  >({});

  // Default settings
  const defaultSettings: OrchestratorSettings = normalizeSettings(initialSettings);

  const [settings, setSettings] = React.useState<OrchestratorSettings>(defaultSettings);
  const [tempSettings, setTempSettings] = React.useState<OrchestratorSettings>(settings);

  // Tool Servers state
  const [addingServerScope, setAddingServerScope] = React.useState<ToolServerScope | null>(null);
  const [newServerUrl, setNewServerUrl] = React.useState('');
  const [editingServer, setEditingServer] = React.useState<{
    id: string;
    scope: ToolServerScope;
  } | null>(null);
  const [editServerUrl, setEditServerUrl] = React.useState('');
  const [connectivityStatus, setConnectivityStatus] = React.useState<
    Record<
      string,
      {
        status: 'checking' | 'connected' | 'disconnected';
        tools?: MCPConnectivityResult['tools'];
        error?: string;
      }
    >
  >({});
  const [hoveredServer, setHoveredServer] = React.useState<string | null>(null);
  const [pinnedServer, setPinnedServer] = React.useState<string | null>(null);

  // Store active connections for cleanup
  const activeConnectionsRef = React.useRef<Map<string, AbortController>>(new Map());
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const serverKey = React.useCallback((scope: ToolServerScope, url: string) => `${scope}:${url}`, []);

  const getServersForScope = React.useCallback(
    (scope: ToolServerScope, currentSettings: OrchestratorSettings = tempSettings) =>
      (currentSettings.toolServers || []).filter(
        (server) => (server.scope || 'backend') === scope
      ),
    [tempSettings]
  );

  const updateServersForScope = React.useCallback(
    (scope: ToolServerScope, nextServers: ToolServer[]) => {
      setTempSettings((prev) => ({
        ...prev,
        toolServers: [
          ...(prev.toolServers || []).filter((server) => (server.scope || 'backend') !== scope),
          ...nextServers.map((server) => ({ ...server, scope })),
        ],
      }));
    },
    []
  );

  const definedTools = React.useCallback(
    (tools: MCPConnectivityResult['tools']) => (tools && tools.length > 0 ? tools : undefined),
    []
  );

  // Update settings when initialSettings prop changes
  React.useEffect(() => {
    if (initialSettings) {
      const normalizedSettings = normalizeSettings(initialSettings);
      const backendOption = BACKEND_OPTIONS.find((opt) => opt.value === normalizedSettings.backend);

      // Check if the model is in the predefined list for this backend
      const modelInList = backendOption?.models?.includes(normalizedSettings.model || '');

      const updatedSettings = {
        ...normalizedSettings,
        backendLabel: backendOption?.label || normalizedSettings.backendLabel,
        // If model is not in the predefined list, automatically set useCustomModel to true
        // Unless useCustomModel is explicitly provided in initialSettings
        useCustomModel:
          initialSettings.useCustomModel !== undefined
            ? initialSettings.useCustomModel
            : !modelInList,
      };
      setSettings(updatedSettings);
      setTempSettings(updatedSettings);
    }
  }, [initialSettings]);

  // Check connectivity for all tool servers when modal opens
  React.useEffect(() => {
    if (isModalOpen) {
      (tempSettings.toolServers || []).forEach((server) => {
        checkMCPServerConnectivity(server.scope || 'backend', server.url);
      });
    }

    // Cleanup: abort all connections when modal closes
    return () => {
      activeConnectionsRef.current.forEach((controller) => controller.abort());
      activeConnectionsRef.current.clear();
    };
  }, [isModalOpen]);

  // Handle click outside to close pinned tooltip
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        // Check if click is on a connectivity indicator
        const target = event.target as HTMLElement;
        if (!target.closest('.connectivity-indicator')) {
          setPinnedServer(null);
        }
      }
    };

    if (pinnedServer) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [pinnedServer]);

  const checkMCPServerConnectivity = async (scope: ToolServerScope, url: string) => {
    const key = serverKey(scope, url);
    // Cancel any existing connection for this URL
    const existingController = activeConnectionsRef.current.get(key);
    if (existingController) {
      existingController.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    activeConnectionsRef.current.set(key, abortController);

    setConnectivityStatus((prev) => ({
      ...prev,
      [key]: { status: 'checking' },
    }));

    try {
      let result: MCPConnectivityResult;

      if (scope === 'local') {
        result = await checkLocalMcpServerConnectivity(url);
      } else {
        const response = await fetch(httpServerUrl + '/check-mcp-servers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            urls: [url],
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        result = data.results[url];
      }

      if (result.status === 'connected') {
        setConnectivityStatus((prev) => ({
          ...prev,
          [key]: {
            status: 'connected',
            tools: definedTools(result.tools),
          },
        }));
      } else {
        setConnectivityStatus((prev) => ({
          ...prev,
          [key]: {
            status: 'disconnected',
            error: result.error || 'Connection failed',
          },
        }));
      }

      activeConnectionsRef.current.delete(key);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was cancelled, don't update status
        return;
      }

      setConnectivityStatus((prev) => ({
        ...prev,
        [key]: {
          status: 'disconnected',
          error: error.message || 'Connection failed',
        },
      }));
      activeConnectionsRef.current.delete(key);
    }
  };

  const handleOpenModal = () => {
    setTempSettings(settings);
    setIsModalOpen(true);
    setActiveTab('orchestrator');
    onClick?.();
  };

  const handleSave = () => {
    setSettings(tempSettings);
    setIsModalOpen(false);
    setAddingServerScope(null);
    setEditingServer(null);
    setPinnedServer(null);
    console.log('Settings saved:', tempSettings);

    // Call the callback with the saved settings
    if (onSettingsChange) {
      onSettingsChange(tempSettings);
    }
  };

  const handleCancel = () => {
    setTempSettings(settings);
    setIsModalOpen(false);
    setAddingServerScope(null);
    setEditingServer(null);
    setPinnedServer(null);
    setActiveTab('orchestrator');
  };

  const handleBackendChange = (newBackend: string) => {
    const newBackendOption = BACKEND_OPTIONS.find((opt) => opt.value === newBackend);

    // Cache the current settings before switching backends
    const updatedCache = {
      ...backendCache,
      [tempSettings.backend]: {
        customUrl: tempSettings.customUrl || '',
        model: tempSettings.model || '',
        reasoningEffort: tempSettings.reasoningEffort,
        useCustomModel: tempSettings.useCustomModel || false,
      },
    };
    setBackendCache(updatedCache);

    // Restore cached URL and model for new backend, or use defaults
    const cached = updatedCache[newBackend];
    const urlToUse = tempSettings.useCustomUrl
      ? cached?.customUrl || newBackendOption?.defaultUrl || ''
      : newBackendOption?.defaultUrl || '';
    const modelToUse = cached?.model
      ? cached?.model
      : cached?.useCustomModel
        ? tempSettings.model || ''
        : newBackendOption?.models[0] || '';
    const useCustomModelToUse = cached?.useCustomModel || false;

    setTempSettings({
      ...tempSettings,
      backend: newBackend,
      customUrl: urlToUse,
      model: modelToUse,
      reasoningEffort: cached?.reasoningEffort || 'medium',
      useCustomModel: useCustomModelToUse,
      backendLabel: newBackendOption!.label,
    });
  };

  const handleCustomUrlToggle = (enabled: boolean) => {
    const backendOption = BACKEND_OPTIONS.find((opt) => opt.value === tempSettings.backend);
    const cached = backendCache[tempSettings.backend];

    setTempSettings({
      ...tempSettings,
      useCustomUrl: enabled,
      // When enabling: check cache first, then current value, then default
      // When disabling: preserve the customUrl value
      customUrl: enabled
        ? cached?.customUrl || tempSettings.customUrl || backendOption?.defaultUrl || ''
        : tempSettings.customUrl,
    });
  };

  const handleCustomUrlChange = (newUrl: string) => {
    // Update the cache with the new custom URL
    const updatedCache = {
      ...backendCache,
      [tempSettings.backend]: {
        customUrl: newUrl,
        model: tempSettings.model,
        reasoningEffort: tempSettings.reasoningEffort,
        useCustomModel: tempSettings.useCustomModel || false,
      },
    };
    setBackendCache(updatedCache);

    setTempSettings({
      ...tempSettings,
      customUrl: newUrl,
    });
  };

  const handleModelSelect = (selectedModel: string) => {
    // Update the cache with the selected model
    const updatedCache = {
      ...backendCache,
      [tempSettings.backend]: {
        customUrl: tempSettings.customUrl || '',
        model: selectedModel,
        reasoningEffort: tempSettings.reasoningEffort,
        useCustomModel: tempSettings.useCustomModel || false,
      },
    };
    setBackendCache(updatedCache);

    setTempSettings({
      ...tempSettings,
      model: selectedModel,
    });
  };

  const handleCustomModelToggle = (enabled: boolean) => {
    const backendOption = BACKEND_OPTIONS.find((opt) => opt.value === tempSettings.backend);
    const cached = backendCache[tempSettings.backend];

    let modelToUse: string;

    if (enabled) {
      // When enabling custom model, keep current model
      modelToUse = tempSettings.model;
    } else {
      // When disabling custom model, find a valid preset model
      // First check if cached model is in the preset list
      const cachedModelInList = cached?.model && backendOption?.models?.includes(cached.model);
      // Then check if current temp model is in the preset list
      const tempModelInList = backendOption?.models?.includes(tempSettings.model);

      if (cachedModelInList) {
        // Use cached model if it's a valid preset
        modelToUse = cached.model;
      } else if (tempModelInList) {
        // Use current temp model if it's a valid preset
        modelToUse = tempSettings.model;
      } else {
        // Fall back to first model in the preset list
        modelToUse = backendOption?.models?.[0] || tempSettings.model;
      }
    }

    const updatedCache = {
      ...backendCache,
      [tempSettings.backend]: {
        customUrl: tempSettings.customUrl || '',
        model: modelToUse,
        reasoningEffort: tempSettings.reasoningEffort,
        useCustomModel: enabled,
      },
    };
    setBackendCache(updatedCache);

    setTempSettings({
      ...tempSettings,
      useCustomModel: enabled,
      model: modelToUse,
    });
  };

  const handleCustomModelChange = (newModel: string) => {
    // Update the cache with the custom model
    const updatedCache = {
      ...backendCache,
      [tempSettings.backend]: {
        customUrl: tempSettings.customUrl || '',
        model: newModel,
        reasoningEffort: tempSettings.reasoningEffort,
        useCustomModel: tempSettings.useCustomModel || false,
      },
    };
    setBackendCache(updatedCache);

    setTempSettings({
      ...tempSettings,
      model: newModel,
    });
  };

  // Tool Server handlers
  const validateServer = async (
    scope: ToolServerScope,
    url: string,
    name?: string
  ): Promise<MCPConnectivityResult> => {
    if (scope === 'local') {
      return checkLocalMcpServerConnectivity(url);
    }

    const response = await fetch(httpServerUrl + '/validate-mcp-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        name,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  };

  const handleAddServer = async (scope: ToolServerScope) => {
    if (!newServerUrl.trim()) return;

    const url = newServerUrl.trim();
    const key = serverKey(scope, url);

    setConnectivityStatus((prev) => ({
      ...prev,
      [key]: { status: 'checking' },
    }));

    try {
      const result = await validateServer(scope, url, `Server ${Date.now()}`);

      if (result.status !== 'connected') {
        setConnectivityStatus((prev) => ({
          ...prev,
          [key]: {
            status: 'disconnected',
            error: result.error || 'Validation failed',
          },
        }));
        alert(`Failed to add server: ${result.error || 'Validation failed'}`);
        return;
      }

      const normalizedUrl = result.url || url;
      const newServer: ToolServer = {
        id: Date.now().toString(),
        url: normalizedUrl,
        scope,
      };

      updateServersForScope(scope, [...getServersForScope(scope), newServer]);
      setConnectivityStatus((prev) => ({
        ...prev,
        [serverKey(scope, normalizedUrl)]: {
          status: 'connected',
          tools: definedTools(result.tools),
        },
      }));

      if (normalizedUrl !== url) {
        setConnectivityStatus((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }

      setNewServerUrl('');
      setAddingServerScope(null);

      if (scope === 'backend' && onServerAdded) {
        onServerAdded();
      }
    } catch (error: any) {
      setConnectivityStatus((prev) => ({
        ...prev,
        [key]: {
          status: 'disconnected',
          error: error.message || 'Connection failed',
        },
      }));
      alert(`Failed to add server: ${error.message || 'Connection failed'}`);
    }
  };

  const handleEditServer = (scope: ToolServerScope, serverId: string) => {
    const server = getServersForScope(scope).find((s) => s.id === serverId);
    if (!server) return;

    setEditingServer({ id: serverId, scope });
    setEditServerUrl(server.url);
  };

  const handleSaveServerEdit = async (scope: ToolServerScope, serverId: string) => {
    if (!editServerUrl.trim()) return;

    const oldServer = getServersForScope(scope).find((s) => s.id === serverId);
    if (!oldServer) return;

    const newUrl = editServerUrl.trim();
    const key = serverKey(scope, newUrl);

    setConnectivityStatus((prev) => ({
      ...prev,
      [key]: { status: 'checking' },
    }));

    try {
      const result = await validateServer(scope, newUrl, oldServer.name || `Server ${serverId}`);

      if (result.status !== 'connected') {
        setConnectivityStatus((prev) => ({
          ...prev,
          [key]: {
            status: 'disconnected',
            error: result.error || 'Validation failed',
          },
        }));
        alert(`Failed to update server: ${result.error || 'Validation failed'}`);
        return;
      }

      const normalizedUrl = result.url || newUrl;
      if (oldServer.url !== normalizedUrl) {
        setConnectivityStatus((prev) => {
          const next = { ...prev };
          delete next[serverKey(scope, oldServer.url)];
          return next;
        });
      }

      updateServersForScope(
        scope,
        getServersForScope(scope).map((server) =>
          server.id === serverId ? { ...server, url: normalizedUrl, scope } : server
        )
      );

      setConnectivityStatus((prev) => ({
        ...prev,
        [serverKey(scope, normalizedUrl)]: {
          status: 'connected',
          tools: definedTools(result.tools),
        },
      }));
      setEditingServer(null);
      setEditServerUrl('');
    } catch (error: any) {
      setConnectivityStatus((prev) => ({
        ...prev,
        [key]: {
          status: 'disconnected',
          error: error.message || 'Connection failed',
        },
      }));
      alert(`Failed to update server: ${error.message || 'Connection failed'}`);
    }
  };

  const handleDeleteServer = async (scope: ToolServerScope, serverId: string) => {
    const server = getServersForScope(scope).find((s) => s.id === serverId);
    if (!server) return;

    if (scope === 'backend') {
      try {
        const response = await fetch(httpServerUrl + '/delete-mcp-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: server.url }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.status !== 'deleted' && result.status !== 'not_found') {
          alert(`Failed to delete server: ${result.message}`);
          return;
        }

        if (onServerRemoved) {
          onServerRemoved();
        }
      } catch (error: any) {
        alert(`Failed to delete server: ${error.message || 'Connection failed'}`);
        return;
      }
    }

    const controller = activeConnectionsRef.current.get(serverKey(scope, server.url));
    if (controller) {
      controller.abort();
      activeConnectionsRef.current.delete(serverKey(scope, server.url));
    }

    setConnectivityStatus((prev) => {
      const next = { ...prev };
      delete next[serverKey(scope, server.url)];
      return next;
    });

    if (pinnedServer === `${scope}:${serverId}`) {
      setPinnedServer(null);
    }

    updateServersForScope(
      scope,
      getServersForScope(scope).filter((candidate) => candidate.id !== serverId)
    );
  };

  const handleClearAllServers = async (scope: ToolServerScope) => {
    const servers = getServersForScope(scope);
    if (servers.length === 0) {
      return;
    }

    if (!confirm(`Remove all ${servers.length} ${scope} MCP servers?`)) {
      return;
    }

    if (scope === 'backend') {
      await Promise.all(
        servers.map(async (server) => {
          try {
            await fetch(httpServerUrl + '/delete-mcp-server', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: server.url }),
            });
          } catch (error) {
            console.warn(`Error deleting ${server.url}:`, error);
          }
        })
      );

      if (onServerRemoved) {
        onServerRemoved();
      }
    }

    servers.forEach((server) => {
      const key = serverKey(scope, server.url);
      const controller = activeConnectionsRef.current.get(key);
      if (controller) {
        controller.abort();
        activeConnectionsRef.current.delete(key);
      }
    });

    setConnectivityStatus((prev) => {
      const next = { ...prev };
      servers.forEach((server) => {
        delete next[serverKey(scope, server.url)];
      });
      return next;
    });
    updateServersForScope(scope, []);
    setPinnedServer(null);
  };

  const currentBackendOption = BACKEND_OPTIONS.find((opt) => opt.value === tempSettings.backend);
  const totalToolServerCount = tempSettings.toolServers?.length || 0;

  const renderServerList = (
    scope: ToolServerScope,
    title: string,
    helperText: string,
    emptyText: string,
    emptySubtext: string,
    addButtonText: string
  ) => {
    const servers = getServersForScope(scope);
    const isAddingHere = addingServerScope === scope;
    const sectionColor = scope === 'backend' ? '#a78bfa' : '#22c55e';
    const sectionBadgeText = scope === 'backend' ? 'Backend connects directly' : 'Browser proxies calls';

    return (
      <div className="space-y-3">
        <div className="flex-between">
          <div>
            <h4 className="heading-3">
              {title}
              <span className="helper-text" style={{ marginLeft: '0.5rem' }}>
                ({sectionBadgeText})
              </span>
            </h4>
            <p className="helper-text">{helperText}</p>
          </div>
          {servers.length > 0 && (
            <button
              onClick={() => handleClearAllServers(scope)}
              className="btn btn-tertiary btn-sm"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          )}
        </div>

        <div className="space-y-2">
          {servers.map((server) => {
            const scopedId = `${scope}:${server.id}`;
            const statusKey = serverKey(scope, server.url);
            const serverStatus = connectivityStatus[statusKey];
            const isEditing = editingServer?.id === server.id && editingServer.scope === scope;

            return (
              <div
                key={scopedId}
                className="glass-panel hover:bg-surface-hover transition-colors"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editServerUrl}
                      onChange={(e) => setEditServerUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveServerEdit(scope, server.id);
                        if (e.key === 'Escape') {
                          setEditingServer(null);
                          setEditServerUrl('');
                        }
                      }}
                      placeholder="https://example.com/mcp"
                      className="form-input"
                      autoFocus
                    />
                    <div className="flex gap-sm">
                      <button
                        onClick={() => handleSaveServerEdit(scope, server.id)}
                        className="btn btn-secondary btn-sm flex-1"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingServer(null);
                          setEditServerUrl('');
                        }}
                        className="btn btn-tertiary btn-sm flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-md">
                    <div
                      className="relative connectivity-indicator"
                      onMouseEnter={() => setHoveredServer(scopedId)}
                      onMouseLeave={() => setHoveredServer(null)}
                      onClick={() => setPinnedServer(pinnedServer === scopedId ? null : scopedId)}
                      style={{ cursor: 'pointer' }}
                    >
                      {serverStatus?.status === 'checking' ? (
                        <Loader2 className="icon-md text-muted animate-spin" />
                      ) : (
                        <div
                          className={`status-indicator ${
                            serverStatus?.status === 'connected'
                              ? 'status-indicator-connected'
                              : 'status-indicator-disconnected'
                          }`}
                          title={
                            serverStatus?.status === 'connected'
                              ? 'Connected (click for tools)'
                              : serverStatus?.error || 'Disconnected'
                          }
                        />
                      )}

                      {(hoveredServer === scopedId || pinnedServer === scopedId) &&
                        serverStatus?.status === 'connected' &&
                        serverStatus.tools &&
                        serverStatus.tools.length > 0 && (
                          <div
                            ref={tooltipRef}
                            className="ws-tooltip"
                            style={{ left: 'auto', right: 0, top: '2.5rem' }}
                          >
                            <p className="text-sm font-semibold mb-2 text-primary">
                              Available Tools:
                            </p>
                            <ul className="text-sm space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                              {serverStatus.tools.map((tool, idx) => (
                                <li key={idx} className="text-secondary">
                                  <span className="text-mono emphasized-text">• {tool.name}</span>
                                  {tool.description && (
                                    <p
                                      className="text-xs text-secondary"
                                      style={{ marginLeft: '0.75rem', marginTop: '0.125rem' }}
                                    >
                                      {tool.description.length > 80
                                        ? `${tool.description.substring(0, 80)}...`
                                        : tool.description}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>

                    <div className="flex-1">
                      <p className="text-sm truncate text-primary">{server.url}</p>
                    </div>

                    <div className="flex items-center gap-sm">
                      <button
                        onClick={() => handleEditServer(scope, server.id)}
                        className="btn-icon"
                        title="Edit server"
                      >
                        <Edit2 className="icon-md" />
                      </button>
                      <button
                        onClick={() => handleDeleteServer(scope, server.id)}
                        className="action-button action-button-danger"
                        title="Delete server"
                      >
                        <Trash2 className="icon-md" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {servers.length === 0 && !isAddingHere && (
            <div
              className="empty-state"
              style={{
                padding: '2rem',
                border: `1px dashed ${sectionColor}`,
                borderRadius: '0.5rem',
              }}
            >
              <Wrench className="empty-state-icon" />
              <p className="empty-state-text">{emptyText}</p>
              <p className="empty-state-subtext">{emptySubtext}</p>
            </div>
          )}
        </div>

        {isAddingHere ? (
          <div className="glass-panel space-y-2" style={{ border: `2px solid ${sectionColor}` }}>
            <label className="form-label-block">MCP Server URL</label>
            <input
              type="text"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddServer(scope);
                if (e.key === 'Escape') {
                  setAddingServerScope(null);
                  setNewServerUrl('');
                }
              }}
              placeholder="http://127.0.0.1:3001/mcp"
              className="form-input"
              autoFocus
            />
            {scope === 'local' && (
              <p className="helper-text">
                The browser will talk to this server and proxy tool calls over the websocket. The
                MCP endpoint must be reachable from this browser and allow cross-origin requests.
              </p>
            )}
            <div className="flex gap-sm">
              <button onClick={() => handleAddServer(scope)} className="btn btn-secondary btn-sm flex-1">
                <Plus className="w-3 h-3" />
                Add Server
              </button>
              <button
                onClick={() => {
                  setAddingServerScope(null);
                  setNewServerUrl('');
                }}
                className="btn btn-tertiary btn-sm flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setAddingServerScope(scope);
              setNewServerUrl('');
            }}
            className="btn btn-secondary btn-sm w-full"
          >
            <Plus className="icon-md" />
            <span>{addButtonText}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <button onClick={handleOpenModal} className={`btn btn-secondary btn-sm ${className}`}>
        <Settings className="w-4 h-4" />
        <span>Settings</span>
        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Orchestrator and Tools Settings Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{username}'s Orchestrator and Tools Settings</h2>
                <p className="modal-subtitle">Configure your connection and tools</p>
              </div>
              <button onClick={handleCancel} className="btn-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tab Navigation */}
            <div
              className="card-header"
              style={{ borderBottom: '1px solid rgba(168, 85, 247, 0.3)' }}
            >
              <div className="flex gap-sm">
                <button
                  onClick={() => setActiveTab('orchestrator')}
                  className={`btn btn-sm transition-colors ${
                    activeTab === 'orchestrator' ? 'btn-primary' : 'btn-tertiary'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Orchestrator</span>
                </button>
                <button
                  onClick={() => setActiveTab('tools')}
                  className={`btn btn-sm transition-colors ${
                    activeTab === 'tools' ? 'btn-primary' : 'btn-tertiary'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>Tool Servers</span>
                  {totalToolServerCount > 0 && (
                    <span className="notification-badge">{totalToolServerCount}</span>
                  )}
                </button>
              </div>
            </div>

            <div className="modal-body space-y-4">
              {/* Orchestrator Tab */}
              {activeTab === 'orchestrator' && (
                <div className="space-y-4">
                  {/* Backend Selector */}
                  <div className="form-group">
                    <label className="form-label">Backend</label>
                    <select
                      value={tempSettings.backend}
                      onChange={(e) => handleBackendChange(e.target.value)}
                      className="form-select"
                    >
                      {BACKEND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Use Custom URL Checkbox */}
                  <div>
                    <label className="form-label cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempSettings.useCustomUrl}
                        onChange={(e) => handleCustomUrlToggle(e.target.checked)}
                        className="form-checkbox"
                      />
                      <span>Use custom URL for this backend</span>
                    </label>
                    <p className="helper-text" style={{ marginLeft: '1.5rem' }}>
                      Override the default endpoint with a custom server URL
                    </p>
                  </div>

                  {/* Custom URL Field (conditional) */}
                  {tempSettings.useCustomUrl && (
                    <div className="form-group animate-fadeIn">
                      <label className="form-label">
                        Custom URL
                        <span className="helper-text" style={{ marginLeft: '0.5rem' }}>
                          {tempSettings.backend === 'vllm' && '(vLLM endpoint)'}
                          {tempSettings.backend === 'ollama' && '(Ollama endpoint)'}
                          {tempSettings.backend === 'livai' && '(LivAI base URL)'}
                          {tempSettings.backend === 'llamame' && '(LLamaMe base URL)'}
                          {tempSettings.backend === 'alcf' && '(ALCF Sophia base URL)'}
                          {tempSettings.backend === 'openai' && '(OpenAI-compatible endpoint)'}
                          {tempSettings.backend === 'gemini' && '(Gemini API endpoint)'}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={tempSettings.customUrl || ''}
                        onChange={(e) => handleCustomUrlChange(e.target.value)}
                        placeholder={currentBackendOption?.defaultUrl || 'http://localhost:8000'}
                        className="form-input"
                      />
                      <p className="helper-text">
                        Default: {currentBackendOption?.defaultUrl || 'Not set'}
                      </p>
                    </div>
                  )}

                  {/* Model Selection */}
                  <div className="form-group">
                    <label className="form-label">
                      Model
                      <span className="helper-text" style={{ marginLeft: '0.5rem' }}>
                        {tempSettings.backend === 'openai' && '(GPT models)'}
                        {tempSettings.backend === 'livai' && '(LLNL Enterprise models)'}
                        {tempSettings.backend === 'llamame' && '(LLNL Internal models)'}
                        {tempSettings.backend === 'alcf' && '(ACLF Internal models)'}
                        {tempSettings.backend === 'gemini' && '(Gemini models)'}
                        {tempSettings.backend === 'ollama' && '(Local models)'}
                        {tempSettings.backend === 'vllm' && '(vLLM models)'}
                      </span>
                    </label>

                    {!tempSettings.useCustomModel ? (
                      <select
                        value={tempSettings.model}
                        onChange={(e) => handleModelSelect(e.target.value)}
                        className="form-select"
                      >
                        {currentBackendOption?.models?.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={tempSettings.model}
                        onChange={(e) => handleCustomModelChange(e.target.value)}
                        placeholder="Enter custom model name"
                        className="form-input"
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Reasoning Effort
                      <span className="helper-text" style={{ marginLeft: '0.5rem' }}>
                        (passed to backend as `reasoningEffort`)
                      </span>
                    </label>
                    <select
                      value={tempSettings.reasoningEffort}
                      onChange={(e) =>
                        setTempSettings({
                          ...tempSettings,
                          reasoningEffort: e.target.value as ReasoningEffort,
                        })
                      }
                      className="form-select"
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </div>

                  {/* Use Custom Model Checkbox */}
                  <div>
                    <label className="form-label cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempSettings.useCustomModel || false}
                        onChange={(e) => handleCustomModelToggle(e.target.checked)}
                        className="form-checkbox"
                      />
                      <span>Use custom model name</span>
                    </label>
                    <p className="helper-text" style={{ marginLeft: '1.5rem' }}>
                      Enter a custom model identifier not in the preset list
                    </p>
                  </div>

                  {/* API Key Field */}
                  <div className="form-group">
                    <label className="form-label">
                      API Key
                      <span className="helper-text" style={{ marginLeft: '0.5rem' }}>
                        {(tempSettings.backend === 'ollama' ||
                          tempSettings.backend === 'huggingface' ||
                          tempSettings.backend === 'vllm') &&
                          '(Optional for local backends)'}
                        {tempSettings.backend === 'openai' && '(OPENAI_API_KEY)'}
                        {tempSettings.backend === 'livai' && '(LIVAI_API_KEY)'}
                        {tempSettings.backend === 'llamame' && '(LLAMAME_API_KEY)'}
                        {tempSettings.backend === 'alcf' && '(ALCF_API_KEY)'}
                        {tempSettings.backend === 'gemini' && '(GOOGLE_API_KEY)'}
                      </span>
                    </label>
                    <input
                      type="password"
                      value={tempSettings.apiKey}
                      onChange={(e) => setTempSettings({ ...tempSettings, apiKey: e.target.value })}
                      placeholder="Enter your API key"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {/* Tool Servers Tab */}
              {activeTab === 'tools' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="heading-3">Custom Tool Servers (MCP)</h3>
                    <p className="helper-text">
                      Backend MCP servers are reached directly by the Flask backend. Local MCP
                      servers are reached by this browser session and proxied to the orchestrator
                      over the websocket.
                    </p>
                  </div>

                  <div
                    className="glass-panel"
                    style={{ border: '1px solid rgba(168, 85, 247, 0.25)' }}
                  >
                    <p className="text-sm text-secondary">
                      Use <code>127.0.0.1</code>, SSH forwards, or machine-local hostnames in the
                      local section when the backend server cannot reach them. Those local MCP
                      endpoints must still be reachable from your browser and usually need CORS
                      enabled.
                    </p>
                  </div>

                  {renderServerList(
                    'local',
                    'Client-Side MCP Servers',
                    'These URLs are resolved from the browser machine and proxied to the backend over the websocket.',
                    'No local MCP servers configured',
                    'Add a server reachable from this browser session, such as 127.0.0.1 or a local SSH tunnel.',
                    'Add Local MCP Server'
                  )}

                  {renderServerList(
                    'backend',
                    'Server-Side MCP Servers',
                    'The backend process connects to these URLs directly. Use this for shared or remote MCP services.',
                    'No backend MCP servers configured',
                    'Add a server the backend can reach directly.',
                    'Add Backend MCP Server'
                  )}

		</div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={handleSave} className="btn btn-primary flex-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Save Settings
              </button>
              <button onClick={handleCancel} className="btn btn-tertiary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
