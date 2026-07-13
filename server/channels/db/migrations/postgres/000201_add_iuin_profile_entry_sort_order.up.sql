ALTER TABLE IuinProfileEntries
    ADD COLUMN IF NOT EXISTS SortOrder BIGINT NOT NULL DEFAULT 0;

WITH ranked_entries AS (
    SELECT
        Id,
        ROW_NUMBER() OVER (PARTITION BY WorkspaceId, ParentId ORDER BY Path) - 1 AS SortOrder
    FROM IuinProfileEntries
)
UPDATE IuinProfileEntries AS entries
SET SortOrder = ranked_entries.SortOrder
FROM ranked_entries
WHERE entries.Id = ranked_entries.Id;

CREATE INDEX IF NOT EXISTS idx_iuinprofileentries_workspace_parent_sort
    ON IuinProfileEntries (WorkspaceId, ParentId, SortOrder);
