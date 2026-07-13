CREATE TABLE IF NOT EXISTS IuinStatusImages (
    Id            VARCHAR(26) PRIMARY KEY,
    CreatorUserId VARCHAR(26) NOT NULL,
    FilePath      TEXT NOT NULL,
    Filename      TEXT NOT NULL DEFAULT '',
    MimeType      VARCHAR(128) NOT NULL,
    SizeBytes     BIGINT NOT NULL DEFAULT 0,
    Width         INTEGER NOT NULL DEFAULT 0,
    Height        INTEGER NOT NULL DEFAULT 0,
    Sha256        VARCHAR(64) NOT NULL,
    CreateAt      BIGINT NOT NULL,
    UpdateAt      BIGINT NOT NULL,
    DeleteAt      BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinstatusimages_creator_sha256_active
    ON IuinStatusImages (CreatorUserId, Sha256)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinstatusimages_creator
    ON IuinStatusImages (CreatorUserId, UpdateAt DESC)
    WHERE DeleteAt = 0;
