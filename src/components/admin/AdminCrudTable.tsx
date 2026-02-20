"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Column {
  key: string;
  header: string;
  width?: string | undefined;
  render?: ((value: unknown, row: Record<string, unknown>) => React.ReactNode) | undefined;
}

interface AdminCrudTableProps {
  title: string;
  description: string;
  apiPath: string;
  columns: Column[];
  initialData: Array<Record<string, unknown>>;
  formFields: FormField[];
  idKey?: string | undefined;
}

interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  required?: boolean | undefined;
  options?: Array<{ value: string; label: string }> | undefined;
  placeholder?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
}

export function AdminCrudTable({
  title,
  description,
  apiPath,
  columns,
  initialData,
  formFields,
  idKey = "id",
}: AdminCrudTableProps) {
  const [data, setData] = useState(initialData);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({});
    setShowForm(false);
    setEditingId(null);
  };

  const openCreate = () => {
    const defaults: Record<string, unknown> = {};
    for (const field of formFields) {
      if (field.type === "number") defaults[field.key] = 0;
      else if (field.type === "boolean") defaults[field.key] = false;
      else defaults[field.key] = "";
    }
    setFormData(defaults);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setFormData({ ...row });
    setEditingId(row[idKey] as string);
    setShowForm(true);
  };

  const handleSave = async () => {
    const isEdit = editingId !== null;
    const url = isEdit ? `${apiPath}/${editingId}` : apiPath;
    const method = isEdit ? "PUT" : "POST";

    // Strip id/timestamps from form data
    const payload = { ...formData };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const result = await res.json() as { data: Record<string, unknown> };
      if (isEdit) {
        setData((prev) => prev.map((r) => (r[idKey] === editingId ? result.data : r)));
      } else {
        setData((prev) => [...prev, result.data]);
      }
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
    if (res.ok) {
      setData((prev) => prev.filter((r) => r[idKey] !== id));
      setDeleteConfirm(null);
    }
  };

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-950 tracking-tight">{title}</h1>
          <p className="mt-1 text-base text-gray-600">{description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add New
        </Button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">
            {editingId ? "Edit" : "Create New"}
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {formFields.map((field) => (
              <div key={field.key} className={field.type === "textarea" ? "col-span-2" : ""}>
                <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
                  />
                ) : field.type === "select" ? (
                  <select
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === "number" ? (
                  <input
                    type="number"
                    value={Number(formData[field.key] ?? 0)}
                    onChange={(e) => updateField(field.key, Number(e.target.value))}
                    min={field.min}
                    max={field.max}
                    step={field.step ?? 1}
                    className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
                  />
                ) : field.type === "boolean" ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(formData[field.key])}
                      onChange={(e) => updateField(field.key, e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">{field.placeholder ?? "Enabled"}</span>
                  </label>
                ) : (
                  <input
                    type="text"
                    value={String(formData[field.key] ?? "")}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleSave()}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {editingId ? "Update" : "Create"}
            </Button>
            <Button size="sm" variant="outline" onClick={resetForm}>
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Data table */}
      {data.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
          No records yet. Click &quot;Add New&quot; to create one.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-2 text-left font-medium text-gray-500"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.header}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium text-gray-500 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const rowId = row[idKey] as string;
                return (
                  <tr key={rowId} className="border-b border-gray-100 hover:bg-gray-50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-2.5">
                        {col.render ? col.render(row[col.key], row) : renderDefault(row[col.key])}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">
                      {deleteConfirm === rowId ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => void handleDelete(rowId)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1 text-gray-400 hover:text-gray-700"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(rowId)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">{data.length} record{data.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

function renderDefault(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  if (typeof value === "boolean") {
    return <Badge variant="outline" className={`text-xs ${value ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>{value ? "Yes" : "No"}</Badge>;
  }
  if (Array.isArray(value)) return <span className="text-gray-500">{value.length} items</span>;
  return <span className="text-gray-900">{String(value)}</span>;
}
