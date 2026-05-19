"use client";

import { useState } from "react";

interface Signatory {
  name: string;
  title: string;
  date: string;
}

interface Props {
  scopeCode: string;
  scopeTitle: string;
  onSignoffChange?: (client: Signatory, partner: Signatory) => void;
}

/**
 * Sign-off block at the bottom of the workbench. Two columns — client side
 * and implementation partner side — each with editable name/title/date.
 * The signatures are not legally binding by themselves; they are the
 * artifact that gets attached to the SOW as an annex.
 */
export function SignoffBlock({ scopeCode, scopeTitle, onSignoffChange }: Props) {
  const [client, setClient] = useState<Signatory>({
    name: "",
    title: "",
    date: "",
  });
  const [partner, setPartner] = useState<Signatory>({
    name: "",
    title: "",
    date: "",
  });

  const update = (
    setter: typeof setClient,
    current: Signatory,
    field: keyof Signatory,
    value: string,
  ) => {
    const next = { ...current, [field]: value };
    setter(next);
    if (onSignoffChange) {
      if (setter === setClient) onSignoffChange(next, partner);
      else onSignoffChange(client, next);
    }
  };

  return (
    <section className="bg-white rounded-xl border-2 border-slate-300 p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-3">Sign-off</h2>
      <p className="text-sm text-slate-700 mb-5">
        By signing below, the client confirms they have walked through the
        standard SAP process for{" "}
        <strong>
          {scopeTitle} ({scopeCode})
        </strong>
        , understand the standard behavior, and agree to the decisions recorded
        above. Any change to this baseline after sign-off triggers a formal
        Change Request with separate effort estimation.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SignatoryCard
          heading="Client representative"
          signatory={client}
          onChange={(field, value) => update(setClient, client, field, value)}
        />
        <SignatoryCard
          heading="Implementation partner"
          signatory={partner}
          onChange={(field, value) => update(setPartner, partner, field, value)}
        />
      </div>
    </section>
  );
}

function SignatoryCard({
  heading,
  signatory,
  onChange,
}: {
  heading: string;
  signatory: Signatory;
  onChange: (field: keyof Signatory, value: string) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
        {heading}
      </div>
      <div className="space-y-3 text-sm">
        <Field
          label="Name"
          value={signatory.name}
          onChange={(v) => onChange("name", v)}
        />
        <Field
          label="Title"
          value={signatory.title}
          onChange={(v) => onChange("title", v)}
        />
        <Field
          label="Date"
          value={signatory.date}
          onChange={(v) => onChange("date", v)}
          placeholder="YYYY-MM-DD"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-slate-500 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full font-semibold text-slate-900 border-b border-dotted border-slate-300 pb-1 bg-transparent focus:outline-none focus:border-slate-500"
      />
    </div>
  );
}
