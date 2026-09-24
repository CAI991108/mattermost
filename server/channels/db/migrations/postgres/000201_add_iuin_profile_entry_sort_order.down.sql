DROP INDEX IF EXISTS idx_iuinprofileentries_workspace_parent_sort;

ALTER TABLE IuinProfileEntries
    DROP COLUMN IF EXISTS SortOrder;
