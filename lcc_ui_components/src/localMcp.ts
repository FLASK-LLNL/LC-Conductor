import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type {
  LocalMcpProxyRequest,
  LocalMcpProxyResponse,
  MCPConnectivityResult,
  MCPToolDefinition,
} from './types.js';

type LocalMcpClient = Client<any, any, any>;
type LocalMcpTransport = StreamableHTTPClientTransport;

type LocalMcpClientEntry = {
  client: LocalMcpClient;
  transport: LocalMcpTransport;
};

const clientCache = new Map<string, Promise<LocalMcpClientEntry>>();

export const normalizeMcpUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed.replace(/\/+$/, '')}/mcp`;
};

const closeClientEntry = async (entry: LocalMcpClientEntry | undefined): Promise<void> => {
  if (!entry) {
    return;
  }

  await entry.client.close?.();
  await entry.transport.close?.();
};

const createClientEntry = async (serverUrl: string): Promise<LocalMcpClientEntry> => {
  const client: LocalMcpClient = new Client(
    {
      name: 'lc-conductor-browser-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  const transport: LocalMcpTransport = new StreamableHTTPClientTransport(new URL(serverUrl));
  await client.connect(transport);
  return { client, transport };
};

const getClientEntry = async (serverUrl: string): Promise<LocalMcpClientEntry> => {
  const normalizedUrl = normalizeMcpUrl(serverUrl);
  const cached = clientCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const created = createClientEntry(normalizedUrl);
  clientCache.set(normalizedUrl, created);

  try {
    return await created;
  } catch (error) {
    clientCache.delete(normalizedUrl);
    throw error;
  }
};

const resetClientEntry = async (serverUrl: string): Promise<void> => {
  const normalizedUrl = normalizeMcpUrl(serverUrl);
  const cached = clientCache.get(normalizedUrl);
  clientCache.delete(normalizedUrl);
  if (!cached) {
    return;
  }

  try {
    await closeClientEntry(await cached);
  } catch {
    // Best-effort cleanup only.
  }
};

const withClientRetry = async <T>(
  serverUrl: string,
  callback: (entry: LocalMcpClientEntry) => Promise<T>
): Promise<T> => {
  const normalizedUrl = normalizeMcpUrl(serverUrl);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const entry = await getClientEntry(normalizedUrl);
    try {
      return await callback(entry);
    } catch (error) {
      await resetClientEntry(normalizedUrl);
      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to establish an MCP session');
};

export const listLocalMcpTools = async (serverUrl: string): Promise<MCPToolDefinition[]> =>
  withClientRetry(serverUrl, async ({ client }) => {
    const result = await client.listTools();
    return (result.tools || []).map((tool) => ({
      name: String(tool.name),
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, unknown>)
          : undefined,
    }));
  });

export const callLocalMcpTool = async (
  serverUrl: string,
  toolName: string,
  argumentsPayload: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  withClientRetry(serverUrl, async ({ client }) =>
    client.callTool({
      name: toolName,
      arguments: argumentsPayload,
    })
  );

export const checkLocalMcpServerConnectivity = async (
  url: string
): Promise<MCPConnectivityResult> => {
  try {
    const normalizedUrl = normalizeMcpUrl(url);
    const tools = await listLocalMcpTools(normalizedUrl);
    return {
      status: 'connected',
      url: normalizedUrl,
      tools,
    };
  } catch (error) {
    return {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
};

export const handleLocalMcpProxyRequest = async (
  data: LocalMcpProxyRequest,
  sendResponse: (response: LocalMcpProxyResponse) => void | Promise<void>
): Promise<void> => {
  if (!data.requestId) {
    return;
  }

  try {
    if (data.requestKind === 'list-tools') {
      const serverResults = await Promise.all(
        (data.servers || []).map(async (serverUrl) => ({
          serverUrl,
          tools: await listLocalMcpTools(serverUrl),
        }))
      );

      await sendResponse({
        action: 'local-mcp-response',
        requestId: data.requestId,
        ok: true,
        result: { servers: serverResults },
      });
      return;
    }

    if (data.requestKind === 'call-tool') {
      if (!data.serverUrl || !data.toolName) {
        throw new Error('Local MCP tool calls require serverUrl and toolName');
      }

      const result = await callLocalMcpTool(
        data.serverUrl,
        data.toolName,
        (data.arguments || {}) as Record<string, unknown>
      );

      await sendResponse({
        action: 'local-mcp-response',
        requestId: data.requestId,
        ok: true,
        result,
      });
      return;
    }

    throw new Error(`Unsupported local MCP request kind: ${data.requestKind || 'unknown'}`);
  } catch (error) {
    await sendResponse({
      action: 'local-mcp-response',
      requestId: data.requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Local MCP request failed',
    });
  }
};
