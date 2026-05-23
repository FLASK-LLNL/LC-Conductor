//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React, { useRef, useState } from 'react';
import { FileText, Image, Upload, X } from 'lucide-react';
import type { AgentAttachment } from './types.js';

const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const matchesAcceptedMimeType = (mimeType: string, acceptedMimeTypes: string[]): boolean => {
  return acceptedMimeTypes.some((accepted) => {
    if (accepted.endsWith('/*')) {
      return mimeType.startsWith(accepted.slice(0, -1));
    }
    return mimeType === accepted;
  });
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
};

const inferMimeType = (file: File): string => {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return '';
};

export interface AttachmentUploadProps {
  value: AgentAttachment[];
  onChange: (attachments: AgentAttachment[]) => void;
  accept?: string;
  acceptedMimeTypes?: string[];
  maxFiles?: number;
  maxSizeBytes?: number;
  disabled?: boolean;
  label?: string;
  emptyLabel?: string;
  invalidTypeMessage?: string;
}

export const AttachmentUpload: React.FC<AttachmentUploadProps> = ({
  value,
  onChange,
  accept = 'image/*',
  acceptedMimeTypes = ['image/*'],
  maxFiles = 5,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  disabled = false,
  label = 'Images',
  emptyLabel = 'Attach images',
  invalidTypeMessage = 'Only supported files can be attached.',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || disabled) return;

    setError(null);
    const next = [...value];
    const availableSlots = maxFiles - next.length;
    const candidates = Array.from(files).slice(0, Math.max(availableSlots, 0));

    if (files.length > availableSlots) {
      setError(`Up to ${maxFiles} files can be attached.`);
    }

    for (const file of candidates) {
      const mimeType = inferMimeType(file);
      if (!matchesAcceptedMimeType(mimeType, acceptedMimeTypes)) {
        setError(invalidTypeMessage);
        continue;
      }
      if (file.size > maxSizeBytes) {
        setError(`Each file must be ${Math.floor(maxSizeBytes / (1024 * 1024))} MB or smaller.`);
        continue;
      }

      const dataUrl = await readFileAsDataUrl(file);
      next.push({
        id: createId(),
        name: file.name,
        mimeType,
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString(),
      });
    }

    onChange(next);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string): void => {
    onChange(value.filter((attachment) => attachment.id !== id));
  };

  const sizeLabel = (sizeBytes: number): string => {
    if (sizeBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="attachment-upload">
      <div className="attachment-upload-header">
        <span className="attachment-upload-label">{label}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || value.length >= maxFiles}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          Add
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        className="attachment-upload-input"
        disabled={disabled || value.length >= maxFiles}
        onChange={(event) => {
          void addFiles(event.target.files);
        }}
      />

      {value.length > 0 && (
        <div className="attachment-file-list">
          {value.map((attachment) => (
            <div className="attachment-file-card" key={attachment.id}>
              {attachment.mimeType.startsWith('image/') ? (
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="attachment-file-thumbnail"
                />
              ) : (
                <div className="attachment-file-thumbnail attachment-file-icon">
                  <FileText className="w-5 h-5" />
                </div>
              )}
              <div className="attachment-file-meta">
                <div className="attachment-file-name">{attachment.name}</div>
                <div className="attachment-file-detail">
                  {attachment.mimeType || 'image'} - {sizeLabel(attachment.sizeBytes)}
                </div>
              </div>
              <button
                type="button"
                className="attachment-file-remove"
                onClick={() => removeAttachment(attachment.id)}
                aria-label={`Remove ${attachment.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <button
          type="button"
          className="attachment-dropzone"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Image className="w-5 h-5" />
          <span>{emptyLabel}</span>
        </button>
      )}

      {error && <div className="attachment-upload-error">{error}</div>}
    </div>
  );
};
