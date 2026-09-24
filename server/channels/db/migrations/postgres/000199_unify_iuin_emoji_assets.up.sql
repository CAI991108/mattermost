CREATE TABLE IF NOT EXISTS IuinEmojiAssets (
    EmojiId       VARCHAR(26) PRIMARY KEY REFERENCES Emoji(Id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinemojiassets_sha256_active
    ON IuinEmojiAssets (Sha256)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserEmojis (
    UserId    VARCHAR(26) NOT NULL,
    EmojiId   VARCHAR(26) NOT NULL REFERENCES Emoji(Id) ON DELETE CASCADE,
    SortOrder BIGINT NOT NULL,
    CreateAt  BIGINT NOT NULL,
    UpdateAt  BIGINT NOT NULL,
    DeleteAt  BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (UserId, EmojiId)
);

CREATE INDEX IF NOT EXISTS idx_iuinuseremojis_user_order
    ON IuinUserEmojis (UserId, SortOrder DESC)
    WHERE DeleteAt = 0;

-- Adopt every existing IUIN sticker into the single Emoji identity space. The
-- old sticker ID is preserved as the Emoji ID so existing posts and image URLs
-- can be served by the compatibility routes without copying the file.
INSERT INTO Emoji (Id, CreateAt, UpdateAt, DeleteAt, CreatorId, Name)
SELECT s.Id, s.CreateAt, s.UpdateAt, s.DeleteAt, s.CreatorUserId, 'iuin_' || LOWER(s.Id)
  FROM IuinStickers s
 WHERE s.DeleteAt = 0
ON CONFLICT (Id) DO NOTHING;

INSERT INTO IuinEmojiAssets
    (EmojiId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, DeleteAt)
SELECT s.Id, s.FilePath, s.Filename, s.MimeType, s.SizeBytes, s.Width, s.Height, s.Sha256, s.CreateAt, s.UpdateAt, s.DeleteAt
  FROM IuinStickers s
  JOIN Emoji e ON e.Id = s.Id AND e.DeleteAt = 0
 WHERE s.DeleteAt = 0
ON CONFLICT (EmojiId) DO NOTHING;

INSERT INTO IuinUserEmojis (UserId, EmojiId, SortOrder, CreateAt, UpdateAt, DeleteAt)
SELECT us.UserId, us.StickerId, us.SortOrder, us.CreateAt, us.UpdateAt, us.DeleteAt
  FROM IuinUserStickers us
  JOIN IuinEmojiAssets a ON a.EmojiId = us.StickerId AND a.DeleteAt = 0
 WHERE us.DeleteAt = 0
ON CONFLICT (UserId, EmojiId) DO UPDATE
SET SortOrder = EXCLUDED.SortOrder,
    UpdateAt = EXCLUDED.UpdateAt,
    DeleteAt = 0;

-- Legacy status uploads were incorrectly inserted into the message Emoji
-- domain. They are intentionally discarded rather than migrated.
DELETE FROM IuinRecentEmojis
 WHERE EmojiName LIKE 'status\_%' ESCAPE '\';

DELETE FROM Emoji
 WHERE Name LIKE 'status\_%' ESCAPE '\';
