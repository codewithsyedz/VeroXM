-- Collection.description and Collection.options are new — legacy's
-- `collections` table has neither. `description` backs the content-model
-- screen's header text (e.g. "Complete blog post structure with SEO
-- fields"); `options` is a freeform JSON bucket for collection-level
-- metadata that doesn't warrant its own column (field groups today; see
-- docs/PHASE-6-NOTES.md's "Content Model screen: all the rest" entry).
ALTER TABLE collections
  ADD COLUMN description TEXT NULL AFTER slug,
  ADD COLUMN options JSON NULL AFTER description;
