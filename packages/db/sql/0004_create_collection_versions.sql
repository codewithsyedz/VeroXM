-- New table, no legacy equivalent — backs the Versions/Comparison tabs.
-- Each row is a point-in-time snapshot of a collection's field
-- definitions (a plain JSON array, same shape collection_fields rows
-- already have), taken by an explicit "Create Version" click, never
-- automatically. There is no restore-from-version yet (see
-- docs/PHASE-6-NOTES.md) — only list + diff.
--
-- No FOREIGN KEY constraints to `collections`/`projects`, on purpose: this
-- migration is the only place in the whole schema that ever tried to add
-- one, and it hit a real, unresolvable MySQL 8 error 3780 (foreign key
-- referencing an incompatible column type) against the actual production
-- table twice in a row — first over signedness, then again after matching
-- signedness, meaning the real column isn't a plain INT UNSIGNED either
-- (most likely BIGINT UNSIGNED, from Laravel's `$table->id()` helper,
-- though that's now a guess rather than something confirmed against the
-- live schema). Every other table in this codebase relates to
-- `collections`/`projects` the same way — a plain indexed integer column,
-- with the relationship enforced at the Prisma/application layer only,
-- never a real DB-level FK — so this brings collection_versions in line
-- with that existing convention instead of continuing to guess at a type
-- this session can't directly inspect.
CREATE TABLE collection_versions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  collection_id INT UNSIGNED NOT NULL,
  label VARCHAR(255) NOT NULL,
  snapshot JSON NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX collection_versions_collection_id_idx (collection_id),
  INDEX collection_versions_project_id_idx (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
