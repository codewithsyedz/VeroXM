-- docs/RBAC-TENANT-RECOMMENDATION.md §6.3/§11.3's own flagged fast-follow,
-- built now: a Project-level approval-workflow override. §6.3's original
-- guidance was "Department-level is the recommended first-slice
-- configuration point" — this migration doesn't add a second, parallel
-- workflow table for the project scope. It widens the SAME
-- `approval_workflows` table 0007 created to be scoped to EITHER a
-- Department OR a Project, never both, never neither:
--
--   - `department_id` becomes NULLABLE (was NOT NULL) — a project-scoped
--     row has no department.
--   - `project_id` is a new NULLABLE, UNIQUE column — a department-scoped
--     row has no project.
--
-- That "exactly one of the two" invariant is enforced at the application
-- layer (apps/api/src/approval-workflows/approval-workflows.service.ts's
-- create paths), not a DB CHECK constraint — this codebase has no existing
-- CHECK-constraint precedent, and every other cross-field invariant here
-- (e.g. ContentService.resolvePublishIntent's own state machine) is
-- already enforced the same way, in the service, not the schema.
--
-- `project_id` deliberately has NO foreign key constraint against
-- `projects` — same reasoning 0007 already documented for
-- `content_approval_requests.project_id` (and every other project_id
-- column in this codebase — 0004, 0005, 0007 all agree): a plain
-- `int unsigned` column, relationship enforced at the Prisma/application
-- layer only.
--
-- `ApprovalStep`, `ContentApprovalRequest`, `ContentApprovalAction` are
-- completely unchanged — a step just names a required role kind
-- regardless of whether its workflow is department- or project-scoped,
-- and the whole approve/reject/audit-trail pipeline already operates
-- purely in terms of `workflow_id`, agnostic to what the workflow itself
-- is attached to.
--
-- Resolution order (ContentService.getActiveWorkflow): a project's own
-- override, if configured, is used AS-IS — it fully replaces the
-- Department's workflow for that project, never merges with it. Removing
-- the override (deleting this row) falls back to the Department's own
-- workflow, exactly as if the override had never existed.
--
-- Run via (only containers can reach `db` — no published port):
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
--     < packages/db/sql/0010_add_project_approval_workflow_override.sql

ALTER TABLE `approval_workflows`
  MODIFY COLUMN `department_id` bigint unsigned NULL;

ALTER TABLE `approval_workflows`
  ADD COLUMN `project_id` int unsigned NULL AFTER `department_id`;

ALTER TABLE `approval_workflows`
  ADD UNIQUE KEY `approval_workflows_project_id_unique` (`project_id`);

-- Verify: existing department-scoped rows untouched (department_id still
-- populated, project_id NULL for all of them); no project-scoped rows
-- exist yet.
SELECT COUNT(*) AS department_scoped_rows FROM approval_workflows WHERE department_id IS NOT NULL AND project_id IS NULL;
SELECT COUNT(*) AS project_scoped_rows FROM approval_workflows WHERE project_id IS NOT NULL;
