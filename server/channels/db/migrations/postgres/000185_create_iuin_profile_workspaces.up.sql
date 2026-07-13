CREATE TABLE IF NOT EXISTS IuinProfileWorkspaces (
    Id                 VARCHAR(26) PRIMARY KEY,
    UserId             VARCHAR(26) NOT NULL,
    RootName           VARCHAR(255) NOT NULL DEFAULT 'profile-readme',
    ActivePath         TEXT NOT NULL DEFAULT 'README.md',
    GitHubRenderedHtml TEXT NOT NULL DEFAULT '',
    CreateAt           BIGINT NOT NULL,
    UpdateAt           BIGINT NOT NULL,
    DeleteAt           BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinprofileworkspaces_user_active
    ON IuinProfileWorkspaces (UserId)
    WHERE DeleteAt = 0;

CREATE INDEX IF NOT EXISTS idx_iuinprofileworkspaces_user_id
    ON IuinProfileWorkspaces (UserId);

CREATE TABLE IF NOT EXISTS IuinProfileEntries (
    Id          VARCHAR(26) PRIMARY KEY,
    WorkspaceId VARCHAR(26) NOT NULL REFERENCES IuinProfileWorkspaces(Id) ON DELETE CASCADE,
    ParentId    VARCHAR(26) NOT NULL DEFAULT '',
    Path        TEXT NOT NULL,
    Name        TEXT NOT NULL,
    Type        VARCHAR(16) NOT NULL,
    MimeType    VARCHAR(128) NOT NULL DEFAULT '',
    SizeBytes   BIGINT NOT NULL DEFAULT 0,
    Sha256      VARCHAR(64) NOT NULL DEFAULT '',
    StorageKey  TEXT NOT NULL DEFAULT '',
    CreateAt    BIGINT NOT NULL,
    UpdateAt    BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinprofileentries_workspace_path
    ON IuinProfileEntries (WorkspaceId, Path);

CREATE INDEX IF NOT EXISTS idx_iuinprofileentries_workspace_parent
    ON IuinProfileEntries (WorkspaceId, ParentId);
