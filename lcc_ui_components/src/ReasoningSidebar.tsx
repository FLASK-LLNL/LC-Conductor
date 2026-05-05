//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React, { useRef, useEffect, useState } from 'react';
import { X, Brain } from 'lucide-react';
import { MarkdownText } from './MarkdownText.js';
import type { SidebarMessage, SidebarProps, SidebarState, VisibleSources } from './types.js';

/**
 * Custom hook for managing sidebar state
 *
 * @returns Sidebar state and setters
 */
export const useSidebarState = (): SidebarState => {
  const [messages, setMessages] = useState<SidebarMessage[]>([]);
  const [sourceFilterOpen, setSourceFilterOpen] = useState<boolean>(false);
  const [visibleSources, setVisibleSources] = useState<VisibleSources>({
    System: true,
    Reasoning: true,
    'Logger (Error)': true,
    'Logger (Warning)': true,
    'Logger (Info)': false,
    'Logger (Debug)': false,
  });

  return {
    messages,
    setMessages,
    sourceFilterOpen,
    setSourceFilterOpen,
    visibleSources,
    setVisibleSources,
  };
};

export interface ReasoningSidebarProps extends SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  storageKey?: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  renderMolecule?: (smiles: string) => React.ReactNode;
}

/**
 * ReasoningSidebar Component
 *
 * A resizable sidebar for displaying reasoning messages with markdown support,
 * message filtering by source, and optional molecule visualization.
 *
 * @example
 * ```tsx
 * const sidebarState = useSidebarState();
 *
 * <ReasoningSidebar
 *   {...sidebarState}
 *   setSidebarOpen={setSidebarOpen}
 *   rdkitModule={rdkitModule}
 *   isOpen={sidebarOpen}
 *   onToggle={() => setSidebarOpen(!sidebarOpen)}
 *   renderMolecule={(smiles) => <MoleculeSVG smiles={smiles} />}
 * />
 * ```
 */
export const ReasoningSidebar: React.FC<ReasoningSidebarProps> = ({
  messages,
  setSidebarOpen,
  sourceFilterOpen,
  setSourceFilterOpen,
  visibleSources,
  setVisibleSources,
  isOpen,
  onToggle,
  storageKey = 'reasoning_sidebar_width',
  minWidth = 200,
  maxWidth = 1600,
  defaultWidth = 400,
  renderMolecule,
  rdkitModule, // Kept for backwards compatibility but prefer renderMolecule
}) => {
  const COLLAPSE_THRESHOLD = 5;

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const animatedMessagesRef = useRef<Set<string>>(new Set());
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMessageCountRef = useRef(messages.length);
  const programmaticScrollUntilRef = useRef<number>(0);

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(storageKey, sidebarWidth.toString());
  }, [sidebarWidth, storageKey]);

  // Check if scrolled to bottom
  const checkIfAtBottom = () => {
    const container = sidebarRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Consider "at bottom" if within 50px of the bottom
    return scrollHeight - scrollTop - clientHeight < 50;
  };

  // Track user scroll interactions (not programmatic scrolls)
  useEffect(() => {
    const container = sidebarRef.current;
    if (!container) return;

    const handleScroll = () => {
      const now = Date.now();

      // Ignore programmatic scrolls (within 500ms of programmatic scroll initiation)
      if (now < programmaticScrollUntilRef.current) {
        console.log('[ReasoningSidebar] Ignoring programmatic scroll event');
        return;
      }

      // User manually scrolled
      const atBottom = checkIfAtBottom();
      console.log('[ReasoningSidebar] User scroll detected:', {
        atBottom,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });

      if (!atBottom) {
        // User scrolled away from bottom
        setUserHasScrolled(true);
        setHasNewMessages(true);
      } else {
        // User scrolled back to bottom manually
        setUserHasScrolled(false);
        setHasNewMessages(false);
      }
    };

    // Listen for actual scroll events (triggered by user interaction)
    container.addEventListener('scroll', handleScroll);

    return () => container.removeEventListener('scroll', handleScroll);
  }, [isOpen]);

  // Detect new messages when user has scrolled away
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      console.log('[ReasoningSidebar] New message detected:', {
        messageCount: messages.length,
        previousCount: prevMessageCountRef.current,
        userHasScrolled,
      });
      if (userHasScrolled) {
        console.log('[ReasoningSidebar] Setting hasNewMessages to true');
        setHasNewMessages(true);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, userHasScrolled]);

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      const containerWidth = window.innerWidth;
      const newWidth = containerWidth - e.clientX;

      // Check if width falls below collapse threshold
      if (newWidth < COLLAPSE_THRESHOLD) {
        onToggle();
        setIsResizing(false);
        return;
      }

      // Constrain width between min and max
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onToggle, minWidth, maxWidth]);

  // Auto-scroll sidebar to bottom when new messages arrive, unless user has manually scrolled away
  useEffect(() => {
    if (sidebarRef.current && messages.length > 0 && isOpen && !userHasScrolled) {
      // Mark this as programmatic scroll for the next 500ms
      programmaticScrollUntilRef.current = Date.now() + 500;

      // Delay scroll to allow molecules to render
      setTimeout(() => {
        if (sidebarRef.current && !userHasScrolled) {
          programmaticScrollUntilRef.current = Date.now() + 500;
          sidebarRef.current.scrollTo({
            top: sidebarRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 100);
    }
  }, [messages, isOpen, userHasScrolled]);

  // Scroll to bottom handler
  const scrollToBottom = () => {
    if (sidebarRef.current) {
      console.log('[ReasoningSidebar] Scroll to bottom clicked - re-enabling follow mode');

      // Re-enable follow mode FIRST
      setUserHasScrolled(false);
      setHasNewMessages(false);

      // Then perform the scroll (mark as programmatic for 500ms)
      programmaticScrollUntilRef.current = Date.now() + 500;
      sidebarRef.current.scrollTo({
        top: sidebarRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  if (!isOpen) {
    return (
      <div className="sidebar sidebar-collapsed sidebar-right">
        <button onClick={onToggle} className="btn-icon" title="Open Reasoning">
          <Brain className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`reasoning-sidebar flex-col ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${sidebarWidth}px`, position: 'relative' }}
    >
      {/* Resize Handle (on left side for right sidebar) */}
      <div
        className={`sidebar-resize-handle sidebar-resize-handle-left ${
          isResizing ? 'bg-secondary' : ''
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        title="Drag to resize (drag right to collapse)"
      >
        <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-secondary group-hover:bg-primary transition-colors" />
        <div className="absolute top-1/2 left-0.5 -translate-y-1/2 flex flex-col gap-1">
          <div className="w-0.5 h-1 bg-secondary group-hover:bg-primary transition-colors" />
          <div className="w-0.5 h-1 bg-secondary group-hover:bg-primary transition-colors" />
          <div className="w-0.5 h-1 bg-secondary group-hover:bg-primary transition-colors" />
        </div>
      </div>

      <div className="card-header">
        <h3 className="heading-3">Reasoning</h3>
        <div className="flex items-center gap-2">
          <div className="filter-control">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSourceFilterOpen(!sourceFilterOpen);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="btn btn-secondary btn-sm"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filter
              <svg
                className={`w-3 h-3 transition-transform ${sourceFilterOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {sourceFilterOpen && (
              <div
                className="filter-menu"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="filter-menu-header">Message Sources</div>
                {Object.keys(visibleSources).map((source) => (
                  <label key={source} className="filter-menu-item">
                    <input
                      type="checkbox"
                      checked={visibleSources[source]}
                      onChange={() =>
                        setVisibleSources((prev) => ({ ...prev, [source]: !prev[source] }))
                      }
                      className="form-checkbox"
                    />
                    <span className="text-sm text-primary">{source}</span>
                    <span className="ml-auto text-xs text-muted">
                      ({messages.filter((m) => m.source === source).length})
                    </span>
                  </label>
                ))}
                <div className="filter-menu-footer">
                  <button
                    onClick={() =>
                      setVisibleSources(
                        Object.keys(visibleSources).reduce(
                          (acc, key) => ({ ...acc, [key]: true }),
                          {}
                        )
                      )
                    }
                    className="btn btn-secondary btn-sm flex-1"
                  >
                    All
                  </button>
                  <button
                    onClick={() =>
                      setVisibleSources(
                        Object.keys(visibleSources).reduce(
                          (acc, key) => ({ ...acc, [key]: false }),
                          {}
                        )
                      )
                    }
                    className="btn btn-secondary btn-sm flex-1"
                  >
                    None
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={onToggle} className="btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="reasoning-messages space-y-3 custom-scrollbar" ref={sidebarRef}>
        {messages.filter((msg) => visibleSources[msg.source]).length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <p className="text-sm">
              {messages.length === 0 ? 'No messages yet' : 'No messages match the selected filters'}
            </p>
          </div>
        ) : (
          messages
            .filter((msg) => visibleSources[msg.source])
            .map((msg, idx) => {
              const messageId = msg.id ? String(msg.id) : `${msg.timestamp}-${idx}`;
              const isNew = !animatedMessagesRef.current.has(messageId);
              if (isNew) {
                animatedMessagesRef.current.add(messageId);
              }

              return (
                <div
                  key={messageId}
                  className={
                    isNew ? 'message-card message-card-new' : 'message-card message-card-existing'
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-muted">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="badge badge-primary">{msg.source}</div>
                  </div>
                  <div className="text-sm text-secondary">
                    <MarkdownText
                      text={msg.message}
                      collapsibleCodeBlocks
                      defaultCollapsedCodeBlocks
                    />
                  </div>
                  {msg.smiles && renderMolecule && (
                    <div className="mt-3 bg-white/50 rounded-lg p-2 flex justify-center">
                      {renderMolecule(msg.smiles)}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {/* New messages indicator */}
      {hasNewMessages && (
        <button
          onClick={scrollToBottom}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-all"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
          New messages
        </button>
      )}
    </div>
  );
};
