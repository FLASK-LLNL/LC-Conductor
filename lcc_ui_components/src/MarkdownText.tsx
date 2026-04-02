//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { MarkdownTextProps } from './types.js';

const DEFAULT_CODE_BLOCK_COLLAPSE_THRESHOLD = 8;

interface CodeBlockProps {
  code: string;
  className?: string;
  language?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapseThreshold?: number;
  previewLineCount?: number;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  className,
  language,
  collapsible = false,
  defaultCollapsed = true,
  collapseThreshold = DEFAULT_CODE_BLOCK_COLLAPSE_THRESHOLD,
  previewLineCount = 3,
}) => {
  const lines = code.length === 0 ? [] : code.split('\n');
  const lineCount = lines.length;
  const shouldCollapse = collapsible && lineCount >= collapseThreshold;
  const [isCollapsed, setIsCollapsed] = React.useState(shouldCollapse && defaultCollapsed);
  const descriptor = [language || 'text', `${lineCount} lines`].join(' • ');
  const preview = lines.slice(0, previewLineCount).join('\n');

  React.useEffect(() => {
    setIsCollapsed(shouldCollapse && defaultCollapsed);
  }, [code, shouldCollapse, defaultCollapsed]);

  const renderedCode = language ? (
    <SyntaxHighlighter style={vscDarkPlus} language={language} PreTag="div">
      {code}
    </SyntaxHighlighter>
  ) : (
    <pre className="markdown-code-block-fallback">
      <code className={className}>{code}</code>
    </pre>
  );

  if (!shouldCollapse) {
    return renderedCode;
  }

  return (
    <div className="markdown-code-block">
      <button
        type="button"
        className="markdown-code-toggle"
        onClick={() => setIsCollapsed((current) => !current)}
      >
        <span>{isCollapsed ? 'Show code' : 'Hide code'}</span>
        <span className="markdown-code-toggle-meta">{descriptor}</span>
      </button>
      {isCollapsed ? (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          className="markdown-code-preview"
        >
          {preview}
        </SyntaxHighlighter>
      ) : (
        renderedCode
      )}
    </div>
  );
};

const createMarkdownComponents = (
  collapsibleCodeBlocks: boolean,
  defaultCollapsedCodeBlocks: boolean,
  codeBlockCollapseThreshold: number
) => ({
  h1: ({ children }: any) => <h3 className="markdown-heading-1">{children}</h3>,
  h2: ({ children }: any) => <h4 className="markdown-heading-2">{children}</h4>,
  h3: ({ children }: any) => <h5 className="markdown-heading-3">{children}</h5>,
  p: ({ children }: any) => <p className="markdown-paragraph">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside">{children}</ol>,
  li: ({ children }: any) => <li className="markdown-list-item">{children}</li>,
  strong: ({ children }: any) => <strong className="markdown-strong">{children}</strong>,
  em: ({ children }: any) => <em className="markdown-em">{children}</em>,
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');
    const isBlock = inline === false || Boolean(match) || code.includes('\n');

    if (isBlock) {
      return (
        <CodeBlock
          className={className}
          code={code}
          language={match?.[1]}
          collapsible={collapsibleCodeBlocks}
          defaultCollapsed={defaultCollapsedCodeBlocks}
          collapseThreshold={codeBlockCollapseThreshold}
        />
      );
    }

    return (
      <code className="markdown-inline-code" {...props}>
        {children}
      </code>
    );
  },
  table: ({ children }: any) => <table className="markdown-table">{children}</table>,
  th: ({ children }: any) => <th className="markdown-table-header">{children}</th>,
  td: ({ children }: any) => <td className="markdown-table-cell">{children}</td>,
});

/**
 * MarkdownText Component
 *
 * Renders markdown text with syntax highlighting and custom styling.
 *
 * @example
 * ```tsx
 * <MarkdownText text="# Hello\n\nThis is **bold** text." />
 * ```
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  className,
  collapsibleCodeBlocks = false,
  defaultCollapsedCodeBlocks = true,
  codeBlockCollapseThreshold = DEFAULT_CODE_BLOCK_COLLAPSE_THRESHOLD,
}) => {
  const markdownComponents = React.useMemo(
    () =>
      createMarkdownComponents(
        collapsibleCodeBlocks,
        defaultCollapsedCodeBlocks,
        codeBlockCollapseThreshold
      ),
    [collapsibleCodeBlocks, defaultCollapsedCodeBlocks, codeBlockCollapseThreshold]
  );

  return (
    <div className={`markdown-content space-y-2 ${className || ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
};
