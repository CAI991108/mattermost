CREATE TABLE IF NOT EXISTS IuinHonorAdminAudits (
    Id            VARCHAR(26) PRIMARY KEY,
    ActorUserId   VARCHAR(26) NOT NULL,
    ActorUsername TEXT NOT NULL DEFAULT '',
    Action        VARCHAR(32) NOT NULL,
    TargetType    VARCHAR(32) NOT NULL,
    TargetId      VARCHAR(64) NOT NULL,
    Summary       TEXT NOT NULL DEFAULT '',
    BeforePayload TEXT NOT NULL DEFAULT '',
    AfterPayload  TEXT NOT NULL DEFAULT '',
    CreateAt      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_iuinhonoradminaudits_created
    ON IuinHonorAdminAudits (CreateAt DESC, Id DESC);

CREATE INDEX IF NOT EXISTS idx_iuinhonoradminaudits_actor
    ON IuinHonorAdminAudits (ActorUsername, CreateAt DESC);

CREATE INDEX IF NOT EXISTS idx_iuinhonoradminaudits_target
    ON IuinHonorAdminAudits (TargetType, TargetId, CreateAt DESC);
