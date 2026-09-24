CREATE TABLE IF NOT EXISTS IuinStickers (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinstickers_sha256_active
    ON IuinStickers (Sha256)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinstickers_creator
    ON IuinStickers (CreatorUserId);

CREATE TABLE IF NOT EXISTS IuinUserStickers (
    UserId    VARCHAR(26) NOT NULL,
    StickerId VARCHAR(26) NOT NULL REFERENCES IuinStickers(Id) ON DELETE CASCADE,
    SortOrder BIGINT NOT NULL,
    CreateAt  BIGINT NOT NULL,
    UpdateAt  BIGINT NOT NULL,
    DeleteAt  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (UserId, StickerId)
);

CREATE INDEX IF NOT EXISTS idx_iuinuserstickers_user_order
    ON IuinUserStickers (UserId, SortOrder)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinRecentEmojis (
    UserId    VARCHAR(26) NOT NULL,
    EmojiName VARCHAR(128) NOT NULL,
    UpdateAt  BIGINT NOT NULL,
    PRIMARY KEY (UserId, EmojiName)
);

CREATE INDEX IF NOT EXISTS idx_iuinrecentemojis_user_updated
    ON IuinRecentEmojis (UserId, UpdateAt DESC);
