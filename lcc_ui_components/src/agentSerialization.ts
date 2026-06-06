import type {
  AgentChatContextItem,
  AgentChatContextUsage,
  AgentChatHistory,
  AgentChatImageRef,
  AgentChatMessage,
  AgentChatReasoningItem,
  AgentChatToolEvent,
  SerializedAgent,
  SerializedAgentInstructionSnapshot,
  SerializedAgentPendingUserMessage,
  SerializedAgentTask,
} from './types.js';

type AgentChatRole = AgentChatMessage['role'];
type JsonRecord = Record<string, unknown>;

export interface DeserializeAgentOptions {
  debug?: boolean;
}

const TOOL_EVENT_TYPES = new Set([
  'function_call',
  'function_result',
  'mcp_server_tool_call',
  'mcp_server_tool_result',
]);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringifyValue = (value: unknown): string => {
  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? String(value) : serialized;
};

const parseAgentMemory = (memory: string | undefined): unknown => {
  if (!memory) return null;
  try {
    return JSON.parse(memory);
  } catch {
    return null;
  }
};

const sessionMessages = (session: unknown): JsonRecord[] => {
  if (!isRecord(session)) return [];
  const state = session.state;
  if (!isRecord(state)) return [];
  const inMemory = state.in_memory;
  if (!isRecord(inMemory)) return [];
  const messages = inMemory.messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter(isRecord);
};

const normalizeRole = (message: JsonRecord): AgentChatRole => {
  const rawRole = stringValue(message.role) || stringValue(message.type) || 'assistant';
  const role = rawRole === 'message' ? 'assistant' : rawRole;
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'tool'
    ? role
    : 'assistant';
};

const contentItems = (message: JsonRecord): unknown[] => {
  const contents = message.contents;
  if (Array.isArray(contents)) return contents;
  if (contents === undefined || contents === null) return [];
  return [contents];
};

const dataUrlMimeType = (dataUrl: string): string =>
  dataUrl.split(';', 1)[0]?.replace(/^data:/, '') || 'image';

const imageRefFromContent = (
  agentKey: string,
  messageIndex: number,
  contentIndex: number,
  dataUrl: string,
  content: JsonRecord
): AgentChatImageRef => ({
  id: stringValue(content.id) || `session-image:${agentKey}:${messageIndex}:${contentIndex}`,
  name: stringValue(content.name) || 'Uploaded image',
  mimeType:
    stringValue(content.media_type) || stringValue(content.mimeType) || dataUrlMimeType(dataUrl),
  sizeBytes: numberValue(content.sizeBytes) || 0,
  dataUrl,
});

const normalizePendingUserMessage = (value: unknown): SerializedAgentPendingUserMessage | null => {
  if (!isRecord(value)) return null;
  const text = stringValue(value.text)?.trim();
  if (!text) return null;
  const images = Array.isArray(value.images) ? value.images.filter(isRecord) : [];
  return {
    text,
    afterMessageCount: numberValue(value.afterMessageCount),
    images: images.map((image, index) => ({
      id: stringValue(image.id) || `pending-image:${index}`,
      name: stringValue(image.name) || 'Uploaded image',
      mimeType: stringValue(image.mimeType) || 'image',
      sizeBytes: numberValue(image.sizeBytes) || 0,
      dataUrl: stringValue(image.dataUrl),
    })),
  };
};

const taskPromptContext = (
  task: SerializedAgentTask | null | undefined
): AgentChatContextItem[] => {
  const context: AgentChatContextItem[] = [];
  const systemPrompt = task?.system_prompt?.trim();
  const userPrompt = task?.user_prompt?.trim();
  if (systemPrompt) {
    context.push({ title: 'Instructions', text: systemPrompt });
  }
  if (userPrompt) {
    context.push({ title: 'Task prompt', text: userPrompt });
  }
  return context;
};

const normalizeInstructionHistory = (value: unknown): SerializedAgentInstructionSnapshot[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const messageCount = numberValue(item.messageCount);
      const instructions = stringValue(item.instructions)?.trim();
      if (messageCount === undefined || !instructions) return null;
      return { messageCount, instructions };
    })
    .filter((item): item is SerializedAgentInstructionSnapshot => item !== null)
    .sort((a, b) => a.messageCount - b.messageCount);
};

const instructionsForMessage = (
  instructionHistory: SerializedAgentInstructionSnapshot[],
  messageIndex: number
): AgentChatContextItem[] => {
  const snapshot = instructionHistory.find((item) => messageIndex < item.messageCount);
  return snapshot ? [{ title: 'Instructions', text: snapshot.instructions }] : [];
};

const providerContextUsage = (
  modelInfo: Record<string, unknown> | undefined
): AgentChatContextUsage | undefined => {
  const lastUsage = modelInfo?.lastUsage;
  if (!isRecord(lastUsage)) return undefined;
  const totalTokens = numberValue(lastUsage.totalTokens);
  if (totalTokens === undefined) return undefined;

  return {
    usedTokens: totalTokens,
    inputTokens: numberValue(lastUsage.inputTokens),
    outputTokens: numberValue(lastUsage.outputTokens),
    reasoningTokens: numberValue(lastUsage.reasoningTokens),
    totalTokens,
    source: 'provider',
    model: stringValue(modelInfo?.model),
  };
};

const deserializeMessage = (
  agentKey: string,
  message: JsonRecord,
  messageIndex: number,
  promptContext: AgentChatContextItem[],
  debug: boolean
): AgentChatMessage | null => {
  const role = normalizeRole(message);
  const textParts: string[] = [];
  const images: AgentChatImageRef[] = [];
  const reasoning: AgentChatReasoningItem[] = [];
  const toolEvents: AgentChatToolEvent[] = [];

  contentItems(message).forEach((content, contentIndex) => {
    if (!isRecord(content)) {
      textParts.push(String(content));
      return;
    }

    const contentType = stringValue(content.type) || '';
    const text = stringValue(content.text);
    const uri = stringValue(content.uri) || stringValue(content.dataUrl);

    if (contentType === 'text' && text !== undefined) {
      textParts.push(text);
      return;
    }

    if (contentType.includes('reasoning')) {
      reasoning.push({
        type: contentType || 'reasoning',
        text: text || '',
        debug: debug ? content.additional_properties : undefined,
      });
      return;
    }

    if (uri?.startsWith('data:image/')) {
      images.push(imageRefFromContent(agentKey, messageIndex, contentIndex, uri, content));
      return;
    }

    if (TOOL_EVENT_TYPES.has(contentType)) {
      toolEvents.push({
        type: contentType,
        name: stringValue(content.name) || stringValue(content.tool_name),
        text: stringifyValue(content),
        raw: debug ? content : undefined,
      });
      return;
    }

    if (text !== undefined) {
      textParts.push(text);
      return;
    }

    if (debug) {
      toolEvents.push({
        type: contentType || 'raw',
        text: stringifyValue(content),
        raw: content,
      });
    }
  });

  const text = textParts.filter(Boolean).join('\n\n');
  if (!text && images.length === 0 && reasoning.length === 0 && toolEvents.length === 0 && !debug) {
    return null;
  }

  return {
    id: `${agentKey}:${messageIndex}`,
    role,
    text,
    context: role === 'user' && promptContext.length > 0 ? promptContext : undefined,
    images,
    reasoning,
    toolEvents,
    raw: debug ? message : undefined,
  };
};

export const deserializeAgentChatHistory = (
  agentKey: string,
  agent: SerializedAgent,
  options: DeserializeAgentOptions = {}
): AgentChatHistory => {
  const session = parseAgentMemory(agent.memory);
  const rawMessages = sessionMessages(session);
  const promptContext = taskPromptContext(agent.task);
  const debug = Boolean(options.debug);
  const instructionHistory = normalizeInstructionHistory(agent.instructionHistory);
  const hasInstructionHistory = instructionHistory.length > 0;
  const userMessageCount = rawMessages.filter(
    (message) => normalizeRole(message) === 'user'
  ).length;
  const messages = rawMessages
    .map((message, index) => {
      const messagePromptContext =
        normalizeRole(message) === 'user' ? instructionsForMessage(instructionHistory, index) : [];
      const fallbackPromptContext =
        !hasInstructionHistory && userMessageCount <= 1 ? promptContext : [];
      return deserializeMessage(
        agentKey,
        message,
        index,
        messagePromptContext.length > 0 ? messagePromptContext : fallbackPromptContext,
        debug
      );
    })
    .filter((message): message is AgentChatMessage => message !== null);
  const pendingUserMessage = normalizePendingUserMessage(agent.pendingUserMessage);
  if (pendingUserMessage && rawMessages.length <= (pendingUserMessage.afterMessageCount || 0)) {
    messages.push({
      id: `${agentKey}:pending-user:${pendingUserMessage.afterMessageCount || 0}`,
      role: 'user',
      text: pendingUserMessage.text,
      pending: true,
      context: promptContext.length > 0 ? promptContext : undefined,
      images: pendingUserMessage.images,
    });
  }
  const lastMessage = [...messages].reverse().find((message) => message.text)?.text || '';

  return {
    agentKey,
    title: agentKey,
    modelInfo: agent.modelInfo,
    contextUsage: providerContextUsage(agent.modelInfo),
    promptContext,
    messages,
    lastMessage,
    rawSession: debug ? session : undefined,
  };
};
