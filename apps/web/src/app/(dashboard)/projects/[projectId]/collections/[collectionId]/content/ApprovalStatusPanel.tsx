"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { approveContentAction, rejectContentAction } from "./actions";

export interface ApprovalStepInfo {
  stepOrder: number;
  requiredRoleKind: string;
}

export interface ApprovalHistoryEntry {
  stepOrder: number;
  actorId: number;
  action: string;
  comment: string | null;
  createdAt: string | null;
}

export interface ApprovalStatus {
  id: number;
  status: string; // 'pending' | 'approved' | 'rejected' | 'withdrawn'
  currentStepOrder: number;
  totalSteps: number;
  steps: ApprovalStepInfo[];
  submittedAt: string | null;
  decidedAt: string | null;
  // Whether the SIGNED-IN user satisfies the current step's required
  // role kind — computed server-side in ContentService.getApprovalStatus
  // via the same satisfiesRoleKind check approveContent/rejectContent
  // enforce, so this can never green-light an action the backend would
  // actually refuse.
  canAct: boolean;
  history: ApprovalHistoryEntry[];
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Project Admin",
  department_admin: "Department Admin",
  tenant_admin: "Tenant Admin",
};

// docs/RBAC-TENANT-RECOMMENDATION.md §6, §8 step 6. Shown on a content
// item's edit page whenever it's ever been submitted through a
// Department's approval workflow (§11's content.service.ts changes create
// this the moment "Published" is checked and a workflow is configured —
// nothing is shown at all otherwise, matching §6.1's "no workflow, no
// gate, no new UI" default). Approve/Reject render only when the
// signed-in user actually satisfies the current step's role kind
// (`status.canAct`, §11.3's flagged display gap fixed) — anyone with mere
// editor-tier project access sees the status and a note explaining what
// role is needed, not clickable buttons the backend would just reject.
// The real enforcement still lives entirely server-side in
// ContentService.approveContent/rejectContent; this is purely about not
// showing a control that would 403.
export default function ApprovalStatusPanel({
  projectId,
  collectionId,
  contentId,
  initialStatus,
}: {
  projectId: string;
  collectionId: string;
  contentId: number;
  initialStatus: ApprovalStatus | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!status) return null;

  const currentStep = status.steps.find((s) => s.stepOrder === status.currentStepOrder);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      try {
        await approveContentAction(projectId, collectionId, contentId, comment.trim() || undefined);
        setComment("");
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to approve");
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectContentAction(projectId, collectionId, contentId, comment.trim() || undefined);
        setComment("");
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reject");
      }
    });
  }

  return (
    <div className="surface-standard mb-6 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Publishing</p>
          <h2 className="mt-2 text-lg font-medium text-[#f2f3fb]">Approval status</h2>
        </div>
        {status.status === "pending" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(77,163,255,0.35)] bg-[rgba(69,49,224,0.18)] px-2.5 py-1 text-[11px] font-medium text-[#4da3ff]">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Pending approval — step {status.currentStepOrder} of {status.totalSteps}
          </span>
        )}
        {status.status === "rejected" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(234,109,118,0.35)] bg-[rgba(234,109,118,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#ea6d76]">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Rejected
          </span>
        )}
        {status.status === "approved" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#34d399]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Approved & published
          </span>
        )}
        {status.status === "withdrawn" && (
          <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#7680a3]">
            Withdrawn
          </span>
        )}
      </div>

      {status.status === "pending" && currentStep && (
        <>
          <p className="mt-2 text-xs text-[#7680a3]">
            Awaiting {ROLE_LABEL[currentStep.requiredRoleKind] ?? currentStep.requiredRoleKind} approval
            before this publishes.
          </p>

          {error && <p className="mt-3 text-xs text-[#ea6d76]">{error}</p>}

          {status.canAct ? (
            <>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment"
                rows={2}
                className="input-quiet mt-4 w-full px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isPending}
                  className="button-primary px-4"
                >
                  <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                  {isPending ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isPending}
                  className="button-secondary px-4 text-[#ea6d76]"
                >
                  <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                  Reject
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-[#7680a3]">
              You don&apos;t hold the{" "}
              {ROLE_LABEL[currentStep.requiredRoleKind] ?? currentStep.requiredRoleKind} role required to
              act on this step.
            </p>
          )}
        </>
      )}

      {status.history.length > 0 && (
        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <p className="eyebrow">History</p>
          <div className="mt-3 flex flex-col gap-2">
            {status.history.map((entry, index) => (
              <div key={index} className="text-xs text-[#b8bfd8]">
                <span className={entry.action === "rejected" ? "text-[#ea6d76]" : "text-[#34d399]"}>
                  {entry.action === "rejected" ? "Rejected" : "Approved"}
                </span>{" "}
                at step {entry.stepOrder}
                {entry.comment && <span className="text-[#7680a3]"> — “{entry.comment}”</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
