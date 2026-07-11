ALTER TABLE IuinAchievements
    ADD COLUMN IF NOT EXISTS ContributorUserId VARCHAR(26) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS ContributorUsername VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE IuinTitles
    ADD COLUMN IF NOT EXISTS ContributorUserId VARCHAR(26) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS ContributorUsername VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE IuinAvatarFrames
    ADD COLUMN IF NOT EXISTS ContributorUserId VARCHAR(26) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS ContributorUsername VARCHAR(64) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS IuinHonorAdminDrafts (
    Id                VARCHAR(26) PRIMARY KEY,
    OwnerUserId       VARCHAR(26) NOT NULL,
    OwnerUsername     VARCHAR(64) NOT NULL DEFAULT '',
    Kind              VARCHAR(32) NOT NULL,
    Status            VARCHAR(16) NOT NULL DEFAULT 'draft',
    ItemId            VARCHAR(64) NOT NULL DEFAULT '',
    Name              TEXT NOT NULL DEFAULT '',
    Description       TEXT NOT NULL DEFAULT '',
    IconStorageKey    TEXT NOT NULL DEFAULT '',
    Category          VARCHAR(64) NOT NULL DEFAULT '',
    Rarity            VARCHAR(32) NOT NULL DEFAULT '',
    UnlockHint        TEXT NOT NULL DEFAULT '',
    FrameStorageKey   TEXT NOT NULL DEFAULT '',
    PreviewStorageKey TEXT NOT NULL DEFAULT '',
    SortOrder         INTEGER NOT NULL DEFAULT 0,
    CreateAt          BIGINT NOT NULL,
    UpdateAt          BIGINT NOT NULL,
    DeleteAt          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_owner_update
    ON IuinHonorAdminDrafts (OwnerUserId, Status, UpdateAt DESC, Id DESC)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_kind_item
    ON IuinHonorAdminDrafts (Kind, ItemId)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinhonoradmindrafts_status_update
    ON IuinHonorAdminDrafts (Status, UpdateAt DESC, Id DESC)
    WHERE DeleteAt = 0;
