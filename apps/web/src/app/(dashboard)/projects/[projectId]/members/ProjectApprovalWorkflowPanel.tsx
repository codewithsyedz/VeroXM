"use client";

import { useState, useTransition } from "react";
import { GripVertical, Plus, Trash2, Workflow } from "lucide-react";
import { removeProjectApprovalWorkflow, saveProjectApprovalWorkflow } from "./actions";

export type ApprovalRoleKind = "admin" | "department_admin" | "tenant_admin";

export interface ApprovalWorkflowStep {
  stepOrder: number;
  requiredRoleKind: ApprovalRoleKind;
}

export interface ProjectApprovalWorkflowConfig {
  id: number;
  name: string;
  steps: ApprovalWorkflowStep[];
}

const ROLE_KIND_LABEL: Record<ApprovalRoleKind, string> = {
  admin: "Project Admin",
  department_admin: "Department Admin",
  tenant_admin: "Tenant Admin",
};

// docs/RBAC-TENANT-RECOMMENDATION.md §6.3/§11.3's own flagged fast-follow,
// built here as §11.6: a Project-level override of its Department's
// approval workflow. Deliberately a near-duplicate of
// departments/[departmentId]/ApprovalWorkflowPanel.tsx rather than a
// shared component — the two differ in scope (project vs department) and
// in which server actions they call.
//
// §11.13 update: `canManage` is no longer unconditional the way the
// comment here used to claim. A security review found that letting a
// Department Admin both configure this override AND grant themselves a
// direct admin{projectId} role (via their own members:manage permission
// on this page) let them silently replace a Tenant-Admin-mandated
// workflow with one they could satisfy themselves — exactly the loophole
// the Department-level panel's own canManage split (canView vs
// canConfigure) exists to prevent. `canManage` here now mirrors that same
// split: Tenant Admin/Super Admin only. A Department Admin still sees
// this panel (so they can tell why a publish is gated) but every mutating
// control below is now conditioned on `canManage`, exactly like the
// Department-level panel already does.
//
// A Project with no override configured is NOT the same as "no gate" —
// it still inherits its Department's own workflow, if any (this panel's
// empty state says so explicitly, rather than implying publishing is
// always direct here).
export default function ProjectApprovalWorkflowPanel({
  projectId,
  initialWorkflow,
  canManage,
}: {
  projectId: string;
  initialWorkflow: ProjectApprovalWorkflowConfig | null;
  canManage: boolean;
}) {
  const [steps, setSteps] = useState<ApprovalRoleKind[]>(
    initialWorkflow ? initialWorkflow.steps.map((s) => s.requiredRoleKind) : [],
  );
  const [hasOverride, setHasOverride] = useState(!!initialWorkflow);
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
      setError("Add at least one step, or use “Remove override” to fall back to the department's workflow.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveProjectApprovalWorkflow(projectId, steps);
        setHasOverride(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save override");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeProjectApprovalWorkflow(projectId);
        setHasOverride(false);
        setSteps([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove override");
      }
    });
  }

  return (
    <div className="surface-standard rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Publishing</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Approval workflow override</h2>
        </div>
        {canManage && hasOverride && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="button-secondary px-3.5 text-[#ea6d76]"
          >
            Remove override
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-[#7680a3]">
        {hasOverride
          ? "This project uses its own approval steps below instead of its department's workflow. Editors can still save drafts freely — only publishing is gated."
          : "No override configured — this project inherits its department's own approval workflow (or publishes directly, if the department has none)."}
      </p>

      {!canManage && (
        <p className="mt-2 text-xs text-[#7680a3]">
          Only a Tenant Admin (or Super Admin) can change this override — you can see it, but not edit it.
        </p>
      )}

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
            <p className="text-sm text-[#b8bfd8]">No steps yet — add one below to turn on an override.</p>
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
            {isPending ? "Saving…" : "Save override"}
          </button>
        </div>
      )}
    </div>
  );
}
