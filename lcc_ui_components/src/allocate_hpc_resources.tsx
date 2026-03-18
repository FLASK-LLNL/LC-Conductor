//#############################################################################
// Copyright 2025-2026 Lawrence Livermore National Security, LLC.
// See the top-level LICENSE file for details.
//
// SPDX-License-Identifier: Apache-2.0
//#############################################################################

import React from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { CurlExecutionResult, HpcAllocation, HpcAllocationResultMessage } from './types.js';

type DraftRow = {
  id: string;
  system: string;
  nodesText: string;
  time: string;
  bank: string;
  status: 'idle' | 'pending' | 'error';
  error?: string;
};

export type AllocateHpcResourcesProps = {
  websocket?: WebSocket;
  savedAllocations: HpcAllocation[];
  onSavedAllocationsChange: (next: HpcAllocation[]) => void;
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parsePositiveInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
};

const isComplete = (row: DraftRow): boolean => {
  return (
    row.system.trim().length > 0 &&
    parsePositiveInt(row.nodesText) !== null &&
    row.time.trim().length > 0 &&
    row.bank.trim().length > 0
  );
};

export const AllocateHpcResources: React.FC<AllocateHpcResourcesProps> = ({
  websocket,
  savedAllocations,
  onSavedAllocationsChange,
}) => {
  const [draftRows, setDraftRows] = React.useState<DraftRow[]>([
    { id: generateId(), system: '', nodesText: '', time: '', bank: '', status: 'idle' },
  ]);
  const pendingByRequestIdRef = React.useRef<Map<string, string>>(new Map());
  const [resultsByRowId, setResultsByRowId] = React.useState<Record<string, CurlExecutionResult>>(
    {},
  );
  const savedAllocationsRef = React.useRef<HpcAllocation[]>(savedAllocations);

  React.useEffect(() => {
    savedAllocationsRef.current = savedAllocations;
  }, [savedAllocations]);

  React.useEffect(() => {
    if (!websocket) return;

    const onMessage = (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const msg = data as Partial<HpcAllocationResultMessage>;
      if (msg.type !== 'allocate-hpc-resources-result' || !msg.requestId || !msg.result) return;

      const rowId = pendingByRequestIdRef.current.get(msg.requestId);
      if (!rowId) return;

      pendingByRequestIdRef.current.delete(msg.requestId);

      setResultsByRowId((prev) => ({ ...prev, [rowId]: msg.result! }));

      if (msg.result!.success) {
        const allocation = msg.allocation;
        if (!allocation) return;

        onSavedAllocationsChange([
          ...(savedAllocationsRef.current || []),
          {
            id: generateId(),
            system: allocation.system,
            nodes: allocation.nodes,
            time: allocation.time,
            bank: allocation.bank,
          },
        ]);

        setDraftRows((prev) => prev.filter((r) => r.id !== rowId));
        return;
      }

      setDraftRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                status: 'error',
                error: msg.result!.error || 'Allocation failed',
              }
            : r,
        ),
      );
    };

    websocket.addEventListener('message', onMessage);
    return () => websocket.removeEventListener('message', onMessage);
  }, [websocket, onSavedAllocationsChange]);

  const addRow = () => {
    setDraftRows((prev) => [
      ...prev,
      { id: generateId(), system: '', nodesText: '', time: '', bank: '', status: 'idle' },
    ]);
  };

  const deleteRow = (rowId: string) => {
    setDraftRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const updateRow = (rowId: string, patch: Partial<DraftRow>) => {
    setDraftRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ...patch, status: 'idle', error: undefined } : r)),
    );
  };

  const saveRow = (row: DraftRow) => {
    if (row.status === 'pending') return;

    const missing: string[] = [];
    if (!row.system.trim()) missing.push('system');
    const nodes = parsePositiveInt(row.nodesText);
    if (nodes === null) missing.push('nodes');
    if (!row.time.trim()) missing.push('time');
    if (!row.bank.trim()) missing.push('bank');

    if (missing.length > 0) {
      setDraftRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                status: 'error',
                error: `Missing/invalid: ${missing.join(', ')}`,
              }
            : r,
        ),
      );
      return;
    }

    if (!websocket) {
      setDraftRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: 'error', error: 'WebSocket connection is required to submit' }
            : r,
        ),
      );
      return;
    }

    if (websocket.readyState !== WebSocket.OPEN) {
      setDraftRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: 'error', error: 'WebSocket is not open (connect first)' }
            : r,
        ),
      );
      return;
    }

    const requestId = generateId();
    pendingByRequestIdRef.current.set(requestId, row.id);

    setDraftRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: 'pending', error: undefined } : r)),
    );

    websocket.send(
      JSON.stringify({
        type: 'allocate-hpc-resources',
        requestId,
        allocation: {
          system: row.system.trim(),
          nodes,
          time: row.time.trim(),
          bank: row.bank.trim(),
        },
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="heading-3">HPC Resources</h3>
          <p className="helper-text">Create and submit allocation requests</p>
        </div>
        <button type="button" onClick={addRow} className="btn btn-secondary btn-sm">
          <Plus className="w-3 h-3" />
          Add Resource
        </button>
      </div>

      {!websocket && (
        <div className="glass-panel text-sm text-secondary">
          HPC allocation requires a WebSocket connection. Pass `websocket` to `SettingsButton`.
        </div>
      )}

      <div className="space-y-3">
        {draftRows.map((row) => {
          const complete = isComplete(row);
          const result = resultsByRowId[row.id];
          const nodes = parsePositiveInt(row.nodesText);

          return (
            <div key={row.id} className="glass-panel space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="form-group">
                  <label className="form-label">System</label>
                  <input
                    type="text"
                    value={row.system}
                    onChange={(e) => updateRow(row.id, { system: e.target.value })}
                    className="form-input"
                    placeholder="lassen"
                    disabled={row.status === 'pending'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nodes</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.nodesText}
                    onChange={(e) => updateRow(row.id, { nodesText: e.target.value })}
                    className="form-input"
                    placeholder="1"
                    disabled={row.status === 'pending'}
                  />
                  {row.nodesText.trim().length > 0 && nodes === null && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                      <p className="text-xs text-primary">Enter a whole number ≥ 1</p>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input
                    type="text"
                    value={row.time}
                    onChange={(e) => updateRow(row.id, { time: e.target.value })}
                    className="form-input"
                    placeholder="01:00:00"
                    disabled={row.status === 'pending'}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bank</label>
                  <input
                    type="text"
                    value={row.bank}
                    onChange={(e) => updateRow(row.id, { bank: e.target.value })}
                    className="form-input"
                    placeholder="mybank"
                    disabled={row.status === 'pending'}
                  />
                </div>
              </div>

              <div className="flex items-center gap-sm">
                <button
                  type="button"
                  onClick={() => saveRow(row)}
                  className="btn btn-primary btn-sm"
                  title={
                    !websocket
                      ? 'WebSocket required'
                      : websocket.readyState !== WebSocket.OPEN
                        ? 'WebSocket not open'
                        : ''
                  }
                >
                  {row.status === 'pending' ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => deleteRow(row.id)}
                  disabled={row.status === 'pending'}
                  className="btn btn-tertiary btn-sm"
                >
                  Delete
                </button>

                {(row.error || result?.error) && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                    <p className="text-xs text-primary">
                      {row.error || 'Allocation failed'}
                      {result?.error ? `: ${result.error}` : ''}
                    </p>
                  </div>
                )}

                {result?.success && (
                  <div className="bg-green-900/20 border border-green-500/30 rounded px-2 py-1">
                    <p className="text-xs text-primary">
                      ✓ Submitted{result.status_code ? ` (${result.status_code})` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-secondary">
          Saved Resources
          {savedAllocations && savedAllocations.length > 0 && (
            <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
              {savedAllocations.length}
            </span>
          )}
        </h3>

        {savedAllocations && savedAllocations.length > 0 ? (
          <div className="space-y-2">
            {savedAllocations.map((alloc) => (
              <div key={alloc.id} className="glass-panel">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-secondary">System</div>
                    <div className="text-primary">{alloc.system}</div>
                  </div>
                  <div>
                    <div className="text-xs text-secondary">Nodes</div>
                    <div className="text-primary">{alloc.nodes}</div>
                  </div>
                  <div>
                    <div className="text-xs text-secondary">Time</div>
                    <div className="text-primary">{alloc.time}</div>
                  </div>
                  <div>
                    <div className="text-xs text-secondary">Bank</div>
                    <div className="text-primary">{alloc.bank}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel text-center py-6 text-secondary text-sm">
            No HPC resources saved yet.
          </div>
        )}
      </div>
    </div>
  );
};
