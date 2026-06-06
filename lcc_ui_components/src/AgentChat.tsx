//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React, { useEffect, useRef, useState } from 'react';
import { Bug, Image, MessageSquare, Send, X } from 'lucide-react';
import { AttachmentUpload } from './AttachmentUpload.js';
import { MarkdownText } from './MarkdownText.js';
import { contextWindowForModel } from './modelContext.js';
import type {
  AgentAttachment,
  AgentChatHistory,
  AgentChatImageRef,
  AgentChatMessage,
} from './types.js';

const imageDataUrl = (
  image: AgentChatImageRef,
  resolveImageDataUrl?: (imageId: string) => string | undefined
): string | undefined => image.dataUrl || resolveImageDataUrl?.(image.id);

const roleLabel = (message: AgentChatMessage): string => {
  if (message.label) return message.label;
  if (message.pending && message.eventKind) return 'In progress';
  const role = message.role;
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Agent';
  if (role === 'tool') return 'Tool';
  return 'System';
};

const formatPercent = (value: number): string => {
  if (value < 1 && value > 0) return `${value.toFixed(2).replace(/0$/, '')}%`;
  return `${Math.round(value)}%`;
};

const formatTokenCount = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1);
    return `${formatted.replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    const formatted = (value / 1_000).toFixed(value >= 10_000 ? 0 : 1);
    return `${formatted.replace(/\.0$/, '')}K`;
  }
  return value.toLocaleString();
};

const AgentContextUsageStatus: React.FC<{
  history: AgentChatHistory | null;
  compact?: boolean;
}> = React.memo(function AgentContextUsageStatus({ history, compact = false }) {
  const usage = history?.contextUsage;
  const usedTokens = usage?.usedTokens;
  if (
    usage?.source !== 'provider' ||
    typeof usedTokens !== 'number' ||
    !Number.isFinite(usedTokens)
  ) {
    return null;
  }

  const providedMaxTokens =
    typeof usage?.maxTokens === 'number' && Number.isFinite(usage.maxTokens)
      ? usage.maxTokens
      : undefined;
  const maxTokens = providedMaxTokens ?? contextWindowForModel(usage?.model);
  const percent = maxTokens
    ? Math.max(0, Math.min(100, (usedTokens / maxTokens) * 100))
    : undefined;
  const reasoningTokens =
    typeof usage?.reasoningTokens === 'number' && Number.isFinite(usage.reasoningTokens)
      ? usage.reasoningTokens
      : undefined;
  const titleParts = [
    `${usedTokens.toLocaleString()} tokens used`,
    reasoningTokens !== undefined
      ? `${reasoningTokens.toLocaleString()} reasoning tokens`
      : undefined,
    maxTokens ? `${maxTokens.toLocaleString()} token context` : undefined,
    usage?.model,
  ].filter(Boolean);
  const statusClassName = `agent-context-status${compact ? ' agent-context-status-compact' : ''}`;
  const usageLabel =
    maxTokens !== undefined
      ? `${formatTokenCount(usedTokens)}/${formatTokenCount(maxTokens)}`
      : `${formatTokenCount(usedTokens)} tokens`;

  if (percent === undefined) {
    return (
      <div className={statusClassName} title={titleParts.join(' | ')}>
        <span className="agent-context-percent">Context used: {usageLabel}</span>
      </div>
    );
  }

  const meterPercent = percent;
  const meterStyle = {
    '--agent-context-percent': `${meterPercent}%`,
  } as React.CSSProperties;

  return (
    <div className={statusClassName} title={titleParts.join(' | ')}>
      <span className="agent-context-meter" style={meterStyle} aria-hidden="true">
        <span />
      </span>
      <span className="agent-context-percent">Context used: {formatPercent(percent)}</span>
    </div>
  );
});

interface LazyDetailsProps {
  className?: string;
  summary: React.ReactNode;
  renderContent: () => React.ReactNode;
}

const LazyDetails: React.FC<LazyDetailsProps> = ({ className, summary, renderContent }) => {
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setHasOpened(true);
        }
      }}
    >
      <summary>{summary}</summary>
      {hasOpened ? renderContent() : null}
    </details>
  );
};

interface AgentChatMessageRowProps {
  message: AgentChatMessage;
  debug: boolean;
  resolveImageDataUrl?: (imageId: string) => string | undefined;
}

const AgentChatMessageRow: React.FC<AgentChatMessageRowProps> = React.memo(
  function AgentChatMessageRow({ message, debug, resolveImageDataUrl }) {
    return (
      <div
        className={`agent-chat-row agent-chat-row-${message.role}${
          message.pending ? ' agent-chat-row-pending' : ''
        }`}
      >
        <div className="agent-chat-speaker">{roleLabel(message)}</div>
        <div className={`agent-chat-bubble agent-chat-bubble-${message.role}`}>
          {message.pending && <div className="agent-chat-pending-label">Response in progress</div>}
          {message.text && <MarkdownText text={message.text} collapsibleCodeBlocks />}

          {message.context && message.context.length > 0 && (
            <LazyDetails
              className="agent-chat-details"
              summary="Prompt context"
              renderContent={() =>
                message.context?.map((item, index) => (
                  <div key={`${message.id}-context-${index}`} className="agent-chat-detail">
                    <div className="agent-chat-detail-title">{item.title}</div>
                    <MarkdownText text={item.text} collapsibleCodeBlocks />
                  </div>
                ))
              }
            />
          )}

          {message.images && message.images.length > 0 && (
            <div className="agent-chat-images">
              {message.images.map((image) => {
                const src = imageDataUrl(image, resolveImageDataUrl);
                return (
                  <button
                    key={image.id}
                    type="button"
                    className="agent-chat-image"
                    disabled={!src}
                    title={image.name}
                  >
                    {src ? <img src={src} alt={image.name} /> : <Image className="w-5 h-5" />}
                    <span>{image.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {message.reasoning && message.reasoning.length > 0 && (
            <LazyDetails
              className="agent-chat-details"
              summary={`Reasoning (${message.reasoning.length})`}
              renderContent={() =>
                message.reasoning?.map((item, index) => (
                  <div key={`${message.id}-reasoning-${index}`} className="agent-chat-detail">
                    <MarkdownText text={item.text || '(empty reasoning item)'} />
                    {debug && item.debug !== undefined && (
                      <pre>{JSON.stringify(item.debug, null, 2)}</pre>
                    )}
                  </div>
                ))
              }
            />
          )}

          {message.toolEvents && message.toolEvents.length > 0 && (
            <LazyDetails
              className="agent-chat-details"
              summary={`Tool events (${message.toolEvents.length})`}
              renderContent={() =>
                message.toolEvents?.map((event, index) => (
                  <pre key={`${message.id}-tool-${index}`} className="agent-chat-detail">
                    {event.text}
                  </pre>
                ))
              }
            />
          )}

          {debug && message.raw !== undefined && (
            <LazyDetails
              className="agent-chat-details"
              summary="Raw message"
              renderContent={() => (
                <pre className="agent-chat-detail">{JSON.stringify(message.raw, null, 2)}</pre>
              )}
            />
          )}
        </div>
      </div>
    );
  }
);

export interface AgentChatPanelProps {
  history: AgentChatHistory | null;
  debug: boolean;
  pending?: boolean;
  sendDisabled?: boolean;
  readOnly?: boolean;
  onDebugChange: (debug: boolean) => void;
  onSend?: (query: string, attachments: AgentAttachment[]) => void;
  resolveImageDataUrl?: (imageId: string) => string | undefined;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = React.memo(function AgentChatPanel({
  history,
  debug,
  pending = false,
  sendDisabled = false,
  readOnly = false,
  onDebugChange,
  onSend,
  resolveImageDataUrl,
}: AgentChatPanelProps) {
  const [query, setQuery] = useState('');
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [history?.messages.length, pending]);

  const submit = (): void => {
    const trimmed = query.trim();
    if (!trimmed || !onSend || pending || sendDisabled) return;
    onSend(trimmed, attachments);
    setQuery('');
    setAttachments([]);
  };

  return (
    <div className="agent-chat-panel">
      <div className="agent-chat-toolbar">
        <AgentContextUsageStatus history={history} />
        <label className="agent-chat-debug-toggle">
          <input
            type="checkbox"
            checked={debug}
            onChange={(event) => onDebugChange(event.target.checked)}
            className="form-checkbox"
          />
          <Bug className="w-4 h-4" />
          Debug
        </label>
      </div>

      <div className="agent-chat-messages custom-scrollbar" ref={scrollRef}>
        {!history || history.messages.length === 0 ? (
          <div className="agent-chat-empty">
            <MessageSquare className="w-8 h-8" />
            <span>No chat messages yet</span>
          </div>
        ) : (
          history.messages.map((message) => (
            <AgentChatMessageRow
              key={message.id}
              message={message}
              debug={debug}
              resolveImageDataUrl={resolveImageDataUrl}
            />
          ))
        )}
        {pending && <div className="agent-chat-pending">Waiting for agent response...</div>}
      </div>

      {!readOnly && (
        <div className="agent-chat-composer">
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                submit();
              }
            }}
            disabled={pending || sendDisabled}
            className="form-textarea agent-chat-input"
            placeholder="Message this agent..."
          />
          <AttachmentUpload
            value={attachments}
            onChange={setAttachments}
            maxFiles={5}
            maxSizeBytes={5 * 1024 * 1024}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!query.trim() || pending || sendDisabled}
            className="btn btn-primary agent-chat-send"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      )}
    </div>
  );
});

export interface AgentChatModalProps extends AgentChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentChatModal: React.FC<AgentChatModalProps> = ({
  isOpen,
  onClose,
  history,
  ...panelProps
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay agent-chat-modal-overlay">
      <div className="modal-content modal-content-lg agent-chat-modal">
        <div className="modal-header">
          <div className="min-w-0">
            <h2 className="modal-title truncate">{history?.title || 'Agent chat'}</h2>
            {history?.subtitle && <div className="modal-subtitle truncate">{history.subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>
        <AgentChatPanel history={history} {...panelProps} />
      </div>
    </div>
  );
};

export interface AgentHistoryListProps {
  histories: AgentChatHistory[];
  activeAgentKeys?: string[];
  onSelect: (agentKey: string) => void;
}

export const AgentHistoryList: React.FC<AgentHistoryListProps> = ({
  histories,
  activeAgentKeys = [],
  onSelect,
}) => {
  if (histories.length === 0) {
    return <div className="agent-history-empty">No agent histories in this experiment</div>;
  }

  const activeAgentKeySet = new Set(activeAgentKeys);

  return (
    <div className="agent-history-list">
      {histories.map((history) => {
        const isActive = activeAgentKeySet.has(history.agentKey);
        return (
          <button
            type="button"
            key={history.agentKey}
            className={`agent-history-item${isActive ? ' agent-history-item-active' : ''}`}
            onClick={() => onSelect(history.agentKey)}
          >
            <div className="agent-history-heading">
              <div className="agent-history-title">{history.title || history.agentKey}</div>
              {isActive && <span className="agent-history-active-badge">Active</span>}
            </div>
            {history.subtitle && <div className="agent-history-subtitle">{history.subtitle}</div>}
            <AgentContextUsageStatus history={history} compact />
            {history.lastMessage && (
              <div className="agent-history-preview">{history.lastMessage}</div>
            )}
          </button>
        );
      })}
    </div>
  );
};
