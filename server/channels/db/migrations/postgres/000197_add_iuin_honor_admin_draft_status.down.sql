DROP INDEX IF EXISTS idx_iuinhonoradmindrafts_status_update;
DROP INDEX IF EXISTS idx_iuinhonoradmindrafts_owner_update;

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_owner_update
    ON IuinHonorAdminDrafts (OwnerUserId, UpdateAt DESC, Id DESC)
    WHERE DeleteAt = 0;

ALTER TABLE IuinHonorAdminDrafts
    DROP COLUMN IF EXISTS Status;
