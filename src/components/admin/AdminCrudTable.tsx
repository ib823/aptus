"use client";

import { useState, useMemo, useCallback } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/shared/DataTable";

interface Column {
  key: string;
  header: string;
  width?: string | undefined;
  /** Declarative format hint (serializable across Server→Client boundary) */
  format?: "truncate" | "percentage" | undefined;
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
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<Record<string, unknown>>({
    defaultValues: {},
  });

  const resetForm = useCallback(() => {
    form.reset({});
    setShowForm(false);
    setEditingId(null);
  }, [form]);

  const openCreate = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    for (const field of formFields) {
      if (field.type === "number") defaults[field.key] = 0;
      else if (field.type === "boolean") defaults[field.key] = false;
      else defaults[field.key] = "";
    }
    form.reset(defaults);
    setEditingId(null);
    setShowForm(true);
  }, [form, formFields]);

  const openEdit = useCallback((row: Record<string, unknown>) => {
    form.reset({ ...row });
    setEditingId(row[idKey] as string);
    setShowForm(true);
  }, [form, idKey]);

  const handleSave = useCallback(async (formData: Record<string, unknown>) => {
    setSaving(true);
    const isEdit = editingId !== null;
    const url = isEdit ? `${apiPath}/${editingId}` : apiPath;
    const method = isEdit ? "PUT" : "POST";

    const payload = { ...formData };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;

    try {
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
        toast.success(isEdit ? "Record updated" : "Record created");
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error ?? "Failed to save record");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }, [editingId, apiPath, idKey, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
      if (res.ok) {
        setData((prev) => prev.filter((r) => r[idKey] !== id));
        setDeleteConfirm(null);
        toast.success("Record deleted");
      } else {
        toast.error("Failed to delete record");
      }
    } catch {
      toast.error("Network error — please try again");
    }
  }, [apiPath, idKey]);

  const tableColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = columns.map((col) => ({
      accessorKey: col.key,
      header: ({ column: tableCol }) => (
        <SortableHeader column={tableCol}>{col.header}</SortableHeader>
      ),
      cell: ({ row }) => {
        const value = row.getValue(col.key);
        if (col.format) return renderFormatted(value, col.format);
        return renderDefault(value);
      },
      ...(col.width ? { size: parseInt(col.width) } : {}),
    }));

    cols.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const rowId = row.original[idKey] as string;
        if (deleteConfirm === rowId) {
          return (
            <div className="flex items-center justify-end gap-1">
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => void handleDelete(rowId)}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row.original)}>
              <Pencil className="size-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirm(rowId)}>
              <Trash2 className="size-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        );
      },
      enableSorting: false,
    });

    return cols;
  }, [columns, idKey, deleteConfirm, handleDelete, openEdit]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-base text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add New
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border rounded-lg p-6 mb-6">
          <h3 className="text-sm font-medium mb-4">
            {editingId ? "Edit" : "Create New"}
          </h3>
          <form onSubmit={form.handleSubmit((d) => void handleSave(d))}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {formFields.map((field) => (
                <div key={field.key} className={field.type === "textarea" ? "col-span-full" : ""}>
                  <Label htmlFor={field.key} className="text-xs text-muted-foreground mb-1">
                    {field.label}
                  </Label>
                  {renderFormField(field, form)}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={saving}>
                <Check className="w-3.5 h-3.5 mr-1" />
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={resetForm}>
                <X className="w-3.5 h-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <DataTable
        columns={tableColumns}
        data={data}
        filterColumn={columns[0]?.key}
        filterPlaceholder={`Filter by ${columns[0]?.header.toLowerCase()}...`}
      />
      <p className="text-xs text-muted-foreground mt-2">
        {data.length} record{data.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function renderFormField(
  field: FormField,
  form: ReturnType<typeof useForm<Record<string, unknown>>>,
) {
  const { register, setValue, watch } = form;
  const value = watch(field.key);

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={field.key}
          {...register(field.key)}
          placeholder={field.placeholder}
          rows={3}
        />
      );
    case "select":
      return (
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => setValue(field.key, v)}
        >
          <SelectTrigger id={field.key}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "number":
      return (
        <Input
          id={field.key}
          type="number"
          {...register(field.key, { valueAsNumber: true })}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
        />
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2 pt-1">
          <Switch
            id={field.key}
            checked={Boolean(value)}
            onCheckedChange={(checked) => setValue(field.key, checked)}
          />
          <Label htmlFor={field.key} className="text-sm">
            {field.placeholder ?? "Enabled"}
          </Label>
        </div>
      );
    default:
      return (
        <Input
          id={field.key}
          type="text"
          {...register(field.key)}
          placeholder={field.placeholder}
        />
      );
  }
}

function renderFormatted(value: unknown, format: "truncate" | "percentage"): React.ReactNode {
  if (format === "percentage") {
    return <span>{typeof value === "number" ? `${Math.round(value * 100)}%` : "—"}</span>;
  }
  // truncate
  return <span className="text-muted-foreground text-xs line-clamp-2">{String(value ?? "")}</span>;
}

function renderDefault(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") {
    return (
      <Badge variant="outline" className={value ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : ""}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }
  if (Array.isArray(value)) return <span className="text-muted-foreground">{value.length} items</span>;
  return <span>{String(value)}</span>;
}
