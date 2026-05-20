'use client';

/**
 * Bundle-creation stakeholder picker.
 *
 * Renders a dynamic list of rows (email + displayName + signatory radio).
 * On every change, serializes to a hidden textarea named "stakeholders" in
 * the same line-format the server expects:
 *
 *   email - Display Name - SIGNATORY
 *   email - Display Name
 *
 * The API contract (src/app/api/presales/bundles/route.ts) does not change.
 * Server-side validation (NO_STAKEHOLDERS, NO_SIGNATORY, INVALID_EMAIL) stays
 * authoritative — this UI is only a typo guard.
 */

import { useEffect, useState } from 'react';

interface Row {
  id: string;
  email: string;
  displayName: string;
}

function newRow(): Row {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `r${Math.random().toString(36).slice(2)}`,
    email: '',
    displayName: '',
  };
}

function serialize(rows: Row[], signatoryId: string | null): string {
  return rows
    .filter((r) => r.email.trim().length > 0)
    .map((r) => {
      const parts = [r.email.trim(), r.displayName.trim() || r.email.trim()];
      if (r.id === signatoryId) parts.push('SIGNATORY');
      return parts.join(' - ');
    })
    .join('\n');
}

export function StakeholderRows() {
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [signatoryId, setSignatoryId] = useState<string | null>(null);
  const [serialized, setSerialized] = useState('');

  useEffect(() => {
    setSerialized(serialize(rows, signatoryId));
  }, [rows, signatoryId]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (signatoryId === id) setSignatoryId(null);
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#5A5A5A', marginBottom: 8 }}>
        Add each stakeholder with their email and the name shown on the workbench. Mark exactly one as the signatory — they are the only one authorised to lock the bundle.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 90px 40px',
          gap: 12,
          padding: '4px 8px',
          fontSize: 11,
          color: '#888780',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 600,
        }}
      >
        <span>Email</span>
        <span>Display name</span>
        <span style={{ textAlign: 'center' }}>Signatory</span>
        <span />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 90px 40px',
              gap: 12,
              alignItems: 'center',
              padding: '6px 8px',
              border: '1px solid #E5E5E5',
              borderRadius: 8,
            }}
          >
            <input
              type="email"
              value={row.email}
              onChange={(e) => updateRow(row.id, { email: e.target.value })}
              placeholder="name@company.com"
              style={inputStyle}
            />
            <input
              type="text"
              value={row.displayName}
              onChange={(e) => updateRow(row.id, { displayName: e.target.value })}
              placeholder="Display name"
              style={inputStyle}
            />
            <input
              type="radio"
              name="stakeholder-signatory"
              checked={signatoryId === row.id}
              onChange={() => setSignatoryId(row.id)}
              title="Designate this stakeholder as the signatory"
              style={{ justifySelf: 'center' }}
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              aria-label="Remove stakeholder row"
              style={{
                justifySelf: 'center',
                width: 28,
                height: 28,
                border: '1px solid #E5E5E5',
                borderRadius: 6,
                background: '#FFFFFF',
                color: '#791F1F',
                fontSize: 14,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            background: '#FFFFFF',
            color: '#002B5C',
            border: '1px dashed #002B5C',
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add stakeholder
        </button>
      </div>

      <textarea
        name="stakeholders"
        value={serialized}
        readOnly
        hidden
        aria-hidden="true"
      />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #E5E5E5',
  borderRadius: 6,
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};
