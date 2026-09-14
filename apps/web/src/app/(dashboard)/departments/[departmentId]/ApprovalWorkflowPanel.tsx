"use client";

import { useState, useTransition } from "react";
import { GripVertical, Plus, Trash2, Workflow } from "lucide-react";
import { removeApprovalWorkflow, saveApprovalWorkflow } from "./actions";

export type ApprovalRoleKind = "admin" | "department_admin" | "tenant_admin";

export interface ApprovalWorkflowStep {
  stepOrder: number;
  requiredRoleKind: ApprovalRoleKind;
}

export interface ApprovalWorkflowConfig {
  id: number;
  name: string;
  steps: ApprovalWorkflowStep[];
}

const ROLE_KIND_LABEL: Record<ApprovalRoleKind, string> = {
  admin: "Project Admin",
  department_admin: "Department Admin",
  tenant_admin: "Tenant Admin",
};

// docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6 — configuring a
// Department's approval workflow: an ordered list of steps, each naming
// the ROLE (not a raw permission — see ApprovalStep's schema comment for
// why) required to approve at that step. No workflow at all (steps.length
// === 0 and no saved config) means "publish directly, no gate," matching
// §6.1's additive-by-default requirement — this panel's empty state
// makes that explicit rather than implying something is missing.
export default function ApprovalWorkflowPanel({
  departmentId,
  initialWorkflow,
  canManage,
}: {
  departmentId: string;
  initialWorkflow: ApprovalWorkflowConfig | null;
  canManage: boolean;
}) {
  const [steps, setSteps] = useState<ApprovalRoleKind[]>(
    initialWorkflow ? initialWorkflow.steps.map((s) => s.requiredRoleKind) : [],
  );
  const [hasWorkflow, setHasWorkflow] = useState(!!initialWorkflow);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addStep() {
    setSteps((prev) => [...prev, "department_admin"]);
  }

  function updateStep(index: number, kind: ApprovalRoleKind) {
    setSteps((prev) => prev.map((s, i) => (i === index ? kind : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    if (steps.length === 0) {
      setError("Add at least one step, or use “Remove workflow” to turn approval off entirely.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveApprovalWorkflow(departmentId, steps);
        setHasWorkflow(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save workflow");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeApprovalWorkflow(departmentId);
        setHasWorkflow(false);
        setSteps([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove workflow");
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Publishing</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Approval workflow</h2>
        </div>
        {canManage && hasWorkflow && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="button-secondary px-3.5 text-[#ea6d76]"
          >
            Remove workflow
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-[#7680a3]">
        {hasWorkflow
          ? "Content in this department must pass every step below, in order, before it publishes. Editors can still save drafts freely — only publishing is gated."
          : "No workflow configured — Editors publish directly in this department, same as everywhere else."}
      </p>

      {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

      {steps.length === 0 && !canManage ? null : (
        <div className="mt-6 flex flex-col gap-3">
          {steps.map((kind, index) => (
            <div
              key={index}
              className="surface-inset flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-[#7680a3]" aria-hidden="true" />
              <span className="text-xs font-mono-code text-[#7680a3]">Step {index + 1}</span>
              {canManage ? (
                <select
                  value={kind}
                  onChange={(e) => updateStep(index, e.target.value as ApprovalRoleKind)}
                  className="input-quiet h-9 flex-1 px-3 text-sm"
                >
                  <option value="admin">Project Admin</option>
                  <option value="department_admin">Department Admin</option>
                  <option value="tenant_admin">Tenant Admin</option>
                </select>
              ) : (
                <span className="flex-1 text-sm text-[#f2f3fb]">{ROLE_KIND_LABEL[kind]} approves</span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  disabled={isPending}
                  className="icon-button text-[#ea6d76] disabled:text-[#7680a3]"
                  aria-label={`Remove step ${index + 1}`}
                  title="Remove step"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {steps.length === 0 && canManage && (
            <p className="text-sm text-[#b8bfd8]">No steps yet — add one below to turn approval on.</p>
          )}
        </div>
      )}

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={addStep} disabled={isPending} className="button-secondary px-3.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add step
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || steps.length === 0}
            className="button-primary px-4"
          >
            <Workflow className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Saving…" : "Save workflow"}
          </button>
        </div>
      )}
    </div>
  );
}
