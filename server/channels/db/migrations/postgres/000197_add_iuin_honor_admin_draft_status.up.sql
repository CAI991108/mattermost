ALTER TABLE IuinHonorAdminDrafts
    ADD COLUMN IF NOT EXISTS Status VARCHAR(16) NOT NULL DEFAULT 'draft';

UPDATE IuinHonorAdminDrafts
SET Status = 'draft'
WHERE Status = '';

DROP INDEX IF EXISTS idx_iuinhonoradmindrafts_owner_update;

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_owner_update
    ON IuinHonorAdminDrafts (OwnerUserId, Status, UpdateAt DESC, Id DESC)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_status_update
    ON IuinHonorAdminDrafts (Status, UpdateAt DESC, Id DESC)
    WHERE DeleteAt = 0;
