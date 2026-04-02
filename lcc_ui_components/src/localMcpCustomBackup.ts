const JSONRPC_VERSION = '2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const MCP_SESSION_HEADER = 'mcp-session-id';
const MCP_PROTOCOL_HEADER = 'mcp-protocol-version';

type JsonRpcSuccess = {
  jsonrpc: string;
  id: string | number;
  result: Record<string, unknown>;
};

type JsonRpcError = {
  jsonrpc: string;
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcMessage = JsonRpcSuccess | JsonRpcError;

type McpSession = {
  sessionId?: string;
  protocolVersion: string;
};

export type LocalMcpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

const sessionCache = new Map<string, McpSession>();
let nextRequestId = 1;

const nextId = () => `browser-mcp-${nextRequestId++}`;

export const normalizeMcpUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed.replace(/\/+$/, '')}/mcp`;
};

const parseJsonRpcMessages = (raw: string, contentType: string | null): JsonRpcMessage[] => {
  if (!raw.trim()) {
    return [];
  }

  if (contentType?.includes('text/event-stream')) {
    const messages: JsonRpcMessage[] = [];
    const events = raw.split(/\n\n+/);
    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      if (dataLines.length === 0) {
        continue;
      }
      messages.push(JSON.parse(dataLines.join('\n')) as JsonRpcMessage);
    }
    return messages;
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as JsonRpcMessage[]) : [parsed as JsonRpcMessage];
};

const postJsonRpc = async (
  url: string,
  body: Record<string, unknown>,
  session?: McpSession
): Promise<{ messages: JsonRpcMessage[]; sessionId?: string }> => {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };

  if (session?.sessionId) {
    headers[MCP_SESSION_HEADER] = session.sessionId;
  }
  if (session?.protocolVersion) {
    headers[MCP_PROTOCOL_HEADER] = session.protocolVersion;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }

  return {
    messages: parseJsonRpcMessages(raw, response.headers.get('content-type')),
    sessionId: response.headers.get(MCP_SESSION_HEADER) || session?.sessionId,
  };
};

const getSuccessResult = (messages: JsonRpcMessage[], expectedId: string): Record<string, unknown> => {
  for (const message of messages) {
    if ('error' in message && String(message.id) === expectedId) {
      throw new Error(message.error.message || 'MCP request failed');
    }
    if ('result' in message && String(message.id) === expectedId) {
      return message.result;
    }
  }
  throw new Error('No MCP response was returned');
};

const initializeSession = async (serverUrl: string): Promise<McpSession> => {
  const normalizedUrl = normalizeMcpUrl(serverUrl);
  const cached = sessionCache.get(normalizedUrl);
  if (cached) {
    return cached;
  }

  const requestId = nextId();
  const initResponse = await postJsonRpc(normalizedUrl, {
    jsonrpc: JSONRPC_VERSION,
    id: requestId,
    method: 'initialize',
    params: {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'lc-conductor-browser-mcp-backup',
        version: '0.1.0',
      },
    },
  });

  const initResult = getSuccessResult(initResponse.messages, requestId);
  const session: McpSession = {
    sessionId: initResponse.sessionId,
    protocolVersion: String(initResult.protocolVersion || DEFAULT_PROTOCOL_VERSION),
  };

  await postJsonRpc(
    normalizedUrl,
    {
      jsonrpc: JSONRPC_VERSION,
      method: 'notifications/initialized',
      params: {},
    },
    session
  );

  sessionCache.set(normalizedUrl, session);
  return session;
};

const withSessionRetry = async <T>(
  serverUrl: string,
  callback: (normalizedUrl: string, session: McpSession) => Promise<T>
): Promise<T> => {
  const normalizedUrl = normalizeMcpUrl(serverUrl);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await initializeSession(normalizedUrl);
    try {
      return await callback(normalizedUrl, session);
    } catch (error) {
      sessionCache.delete(normalizedUrl);
      if (attempt === 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to establish an MCP session');
};

export const listLocalMcpTools = async (serverUrl: string): Promise<LocalMcpToolDefinition[]> =>
  withSessionRetry(serverUrl, async (normalizedUrl, session) => {
    const requestId = nextId();
    const response = await postJsonRpc(
      normalizedUrl,
      {
        jsonrpc: JSONRPC_VERSION,
        id: requestId,
        method: 'tools/list',
        params: {},
      },
      session
    );
    const result = getSuccessResult(response.messages, requestId);
    return ((result.tools as Array<Record<string, unknown>> | undefined) || []).map((tool) => ({
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
  withSessionRetry(serverUrl, async (normalizedUrl, session) => {
    const requestId = nextId();
    const response = await postJsonRpc(
      normalizedUrl,
      {
        jsonrpc: JSONRPC_VERSION,
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: argumentsPayload,
        },
      },
      session
    );
    return getSuccessResult(response.messages, requestId);
  });
