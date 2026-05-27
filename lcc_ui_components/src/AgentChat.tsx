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
  const role = message.role;
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Agent';
  if (role === 'tool') return 'Tool';
  return 'System';
};

export interface AgentChatPanelProps {
  history: AgentChatHistory | null;
  debug: boolean;
  pending?: boolean;
  readOnly?: boolean;
  onDebugChange: (debug: boolean) => void;
  onSend?: (query: string, attachments: AgentAttachment[]) => void;
  resolveImageDataUrl?: (imageId: string) => string | undefined;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  history,
  debug,
  pending = false,
  readOnly = false,
  onDebugChange,
  onSend,
  resolveImageDataUrl,
}) => {
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
    if (!trimmed || !onSend || pending) return;
    onSend(trimmed, attachments);
    setQuery('');
    setAttachments([]);
  };

  return (
    <div className="agent-chat-panel">
      <div className="agent-chat-toolbar">
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

      <details className="agent-chat-prompt-context">
        <summary>Prompt context</summary>
        {history?.promptContext && history.promptContext.length > 0 ? (
          history.promptContext.map((item, index) => (
            <div key={`history-context-${index}`} className="agent-chat-detail">
              <div className="agent-chat-detail-title">{item.title}</div>
              <MarkdownText text={item.text} collapsibleCodeBlocks />
            </div>
          ))
        ) : (
          <div className="agent-chat-detail agent-chat-detail-muted">
            Prompt context not available
          </div>
        )}
      </details>

      <div className="agent-chat-messages custom-scrollbar" ref={scrollRef}>
        {!history || history.messages.length === 0 ? (
          <div className="agent-chat-empty">
            <MessageSquare className="w-8 h-8" />
            <span>No chat messages yet</span>
          </div>
        ) : (
          history.messages.map((message) => (
            <div key={message.id} className={`agent-chat-row agent-chat-row-${message.role}`}>
              <div className="agent-chat-speaker">{roleLabel(message)}</div>
              <div className={`agent-chat-bubble agent-chat-bubble-${message.role}`}>
                {message.text && <MarkdownText text={message.text} collapsibleCodeBlocks />}

                {message.context && message.context.length > 0 && (
                  <details className="agent-chat-details">
                    <summary>Prompt context</summary>
                    {message.context.map((item, index) => (
                      <div key={`${message.id}-context-${index}`} className="agent-chat-detail">
                        <div className="agent-chat-detail-title">{item.title}</div>
                        <MarkdownText text={item.text} collapsibleCodeBlocks />
                      </div>
                    ))}
                  </details>
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
                  <details className="agent-chat-details">
                    <summary>Reasoning ({message.reasoning.length})</summary>
                    {message.reasoning.map((item, index) => (
                      <div key={`${message.id}-reasoning-${index}`} className="agent-chat-detail">
                        <MarkdownText text={item.text || '(empty reasoning item)'} />
                        {debug && item.debug !== undefined && (
                          <pre>{JSON.stringify(item.debug, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </details>
                )}

                {message.toolEvents && message.toolEvents.length > 0 && (
                  <details className="agent-chat-details">
                    <summary>Tool events ({message.toolEvents.length})</summary>
                    {message.toolEvents.map((event, index) => (
                      <pre key={`${message.id}-tool-${index}`} className="agent-chat-detail">
                        {event.text}
                      </pre>
                    ))}
                  </details>
                )}

                {debug && message.raw !== undefined && (
                  <details className="agent-chat-details">
                    <summary>Raw message</summary>
                    <pre className="agent-chat-detail">{JSON.stringify(message.raw, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
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
            disabled={pending}
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
            disabled={!query.trim() || pending}
            className="btn btn-primary agent-chat-send"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      )}
    </div>
  );
};

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
  onSelect: (agentKey: string) => void;
}

export const AgentHistoryList: React.FC<AgentHistoryListProps> = ({ histories, onSelect }) => {
  if (histories.length === 0) {
    return <div className="agent-history-empty">No agent histories in this experiment</div>;
  }

  return (
    <div className="agent-history-list">
      {histories.map((history) => (
        <button
          type="button"
          key={history.agentKey}
          className="agent-history-item"
          onClick={() => onSelect(history.agentKey)}
        >
          <div className="agent-history-title">{history.title || history.agentKey}</div>
          {history.subtitle && <div className="agent-history-subtitle">{history.subtitle}</div>}
          {history.lastMessage && (
            <div className="agent-history-preview">{history.lastMessage}</div>
          )}
        </button>
      ))}
    </div>
  );
};
