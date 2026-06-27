CREATE TABLE IF NOT EXISTS IuinAchievements (
    Id             VARCHAR(64) PRIMARY KEY,
    Name           TEXT NOT NULL,
    Description    TEXT NOT NULL DEFAULT '',
    IconStorageKey TEXT NOT NULL DEFAULT '',
    Category       VARCHAR(64) NOT NULL DEFAULT '',
    Rarity         VARCHAR(32) NOT NULL DEFAULT '',
    UnlockHint     TEXT NOT NULL DEFAULT '',
    SortOrder      INTEGER NOT NULL DEFAULT 0,
    CreateAt       BIGINT NOT NULL,
    UpdateAt       BIGINT NOT NULL,
    DeleteAt       BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinachievements_sort_order
    ON IuinAchievements (SortOrder, Id)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserAchievements (
    Id            VARCHAR(26) PRIMARY KEY,
    UserId        VARCHAR(26) NOT NULL,
    AchievementId VARCHAR(64) NOT NULL,
    UnlockedAt    BIGINT NOT NULL,
    EvidenceType  VARCHAR(32) NOT NULL DEFAULT '',
    EvidenceId    VARCHAR(64) NOT NULL DEFAULT '',
    Visibility    VARCHAR(16) NOT NULL DEFAULT 'public',
    Payload       TEXT NOT NULL DEFAULT '',
    CreateAt      BIGINT NOT NULL,
    UpdateAt      BIGINT NOT NULL,
    DeleteAt      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinuserachievements_user_id
    ON IuinUserAchievements (UserId)
    WHERE DeleteAt = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinuserachievements_user_achievement_active
    ON IuinUserAchievements (UserId, AchievementId)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinFeaturedAchievements (
    Id            VARCHAR(26) PRIMARY KEY,
    UserId        VARCHAR(26) NOT NULL,
    AchievementId VARCHAR(64) NOT NULL,
    SortOrder     INTEGER NOT NULL DEFAULT 0,
    CreateAt      BIGINT NOT NULL,
    UpdateAt      BIGINT NOT NULL,
    DeleteAt      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinfeaturedachievements_user_sort
    ON IuinFeaturedAchievements (UserId, SortOrder)
    WHERE DeleteAt = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinfeaturedachievements_user_achievement_active
    ON IuinFeaturedAchievements (UserId, AchievementId)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinTitles (
    Id             VARCHAR(64) PRIMARY KEY,
    Name           TEXT NOT NULL,
    Description    TEXT NOT NULL DEFAULT '',
    IconStorageKey TEXT NOT NULL DEFAULT '',
    Rarity         VARCHAR(32) NOT NULL DEFAULT '',
    UnlockHint     TEXT NOT NULL DEFAULT '',
    SortOrder      INTEGER NOT NULL DEFAULT 0,
    CreateAt       BIGINT NOT NULL,
    UpdateAt       BIGINT NOT NULL,
    DeleteAt       BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuintitles_sort_order
    ON IuinTitles (SortOrder, Id)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserTitles (
    Id          VARCHAR(26) PRIMARY KEY,
    UserId      VARCHAR(26) NOT NULL,
    TitleId     VARCHAR(64) NOT NULL,
    GrantType   VARCHAR(32) NOT NULL DEFAULT 'demo',
    GrantSourceId VARCHAR(64) NOT NULL DEFAULT '',
    GrantedAt   BIGINT NOT NULL,
    CreateAt    BIGINT NOT NULL,
    UpdateAt    BIGINT NOT NULL,
    DeleteAt    BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinusertitles_user_id
    ON IuinUserTitles (UserId)
    WHERE DeleteAt = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinusertitles_user_title_active
    ON IuinUserTitles (UserId, TitleId)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserTitleLoadouts (
    Id       VARCHAR(26) PRIMARY KEY,
    UserId   VARCHAR(26) NOT NULL,
    TitleId  VARCHAR(64) NOT NULL DEFAULT '',
    CreateAt BIGINT NOT NULL,
    UpdateAt BIGINT NOT NULL,
    DeleteAt BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinusertitleloadouts_user_active
    ON IuinUserTitleLoadouts (UserId)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinAvatarFrames (
    Id                VARCHAR(64) PRIMARY KEY,
    Name              TEXT NOT NULL,
    Description       TEXT NOT NULL DEFAULT '',
    FrameStorageKey   TEXT NOT NULL DEFAULT '',
    PreviewStorageKey TEXT NOT NULL DEFAULT '',
    Rarity            VARCHAR(32) NOT NULL DEFAULT '',
    UnlockHint        TEXT NOT NULL DEFAULT '',
    SortOrder         INTEGER NOT NULL DEFAULT 0,
    CreateAt          BIGINT NOT NULL,
    UpdateAt          BIGINT NOT NULL,
    DeleteAt          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinavatarframes_sort_order
    ON IuinAvatarFrames (SortOrder, Id)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserAvatarFrames (
    Id            VARCHAR(26) PRIMARY KEY,
    UserId        VARCHAR(26) NOT NULL,
    AvatarFrameId VARCHAR(64) NOT NULL,
    GrantType     VARCHAR(32) NOT NULL DEFAULT 'demo',
    GrantSourceId VARCHAR(64) NOT NULL DEFAULT '',
    GrantedAt     BIGINT NOT NULL,
    CreateAt      BIGINT NOT NULL,
    UpdateAt      BIGINT NOT NULL,
    DeleteAt      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_iuinuseravatarframes_user_id
    ON IuinUserAvatarFrames (UserId)
    WHERE DeleteAt = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinuseravatarframes_user_frame_active
    ON IuinUserAvatarFrames (UserId, AvatarFrameId)
    WHERE DeleteAt = 0;

CREATE TABLE IF NOT EXISTS IuinUserAvatarFrameLoadouts (
    Id            VARCHAR(26) PRIMARY KEY,
    UserId        VARCHAR(26) NOT NULL,
    AvatarFrameId VARCHAR(64) NOT NULL DEFAULT '',
    CreateAt      BIGINT NOT NULL,
    UpdateAt      BIGINT NOT NULL,
    DeleteAt      BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iuinuseravatarframeloadouts_user_active
    ON IuinUserAvatarFrameLoadouts (UserId)
    WHERE DeleteAt = 0;

INSERT INTO IuinAchievements
    (Id, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, SortOrder, CreateAt, UpdateAt)
VALUES
    ('achv_profile_anchor', '第一张学术名片', '研究身份终于有了一个可以被认真认识的入口。', 'profile/honors/achievements/achv_profile_anchor/icon.png', 'profile', 'common', '完善研究方向、教育经历和主页入口。', 10, 0, 0),
    ('achv_readme_door', 'README 有门牌', '你的主页不再只是展示，而像一间能被访问的研究工作室。', 'profile/honors/achievements/achv_readme_door/icon.png', 'profile', 'common', '建立 README 主页目录和项目入口。', 20, 0, 0),
    ('achv_late_trace', '凌晨留痕', '你把凌晨的想法留成了别人也能接住的东西。', 'profile/honors/achievements/achv_late_trace/icon.png', 'collaboration', 'rare', '在深夜留下带证据的公开研究记录。', 30, 0, 0),
    ('achv_echo_beyond', '回声室之外', '你的声音越过熟悉房间，被另一个角落的人听见了。', 'profile/honors/achievements/achv_echo_beyond/icon.png', 'collaboration', 'rare', '让非熟悉频道成员回复或反应你的内容。', 40, 0, 0),
    ('achv_repro_seed', '第一颗种子', '可复现不是口号，是从第一颗种子开始。', 'profile/honors/achievements/achv_repro_seed/icon.png', 'experiment', 'common', '实验记录包含 seed、数据版本和运行环境。', 50, 0, 0),
    ('achv_lit_skeleton', '摘要之外', '你读的不是标题和结论，而是整篇论文的骨架。', 'profile/honors/achievements/achv_lit_skeleton/icon.png', 'literature', 'common', '文献笔记覆盖问题、方法、实验、局限和可复用点。', 60, 0, 0),
    ('achv_decision_trace', '决策留痕官', '未来的你会感谢今天留下的证据。', 'profile/honors/achievements/achv_decision_trace/icon.png', 'meeting', 'rare', '把关键决定同步到项目频道或纪要。', 70, 0, 0),
    ('achv_code_signpost', '代码路标', '后来者不用猜门在哪里。', 'profile/honors/achievements/achv_code_signpost/icon.png', 'experiment', 'common', '为复杂实验入口补充最小运行命令。', 80, 0, 0),
    ('achv_homepage_cited', '主页被引用', '你的主页开始替你做介绍。', 'profile/honors/achievements/achv_homepage_cited/icon.png', 'profile', 'epic', '主页链接被他人在公开协作中引用。', 90, 0, 0),
    ('achv_gallery_curator', '学术橱窗整理师', '时间线清爽到像一份会呼吸的学术档案。', 'profile/honors/achievements/achv_gallery_curator/icon.png', 'profile', 'common', '整理教育、论文、获奖等 academic entries。', 100, 0, 0)
ON CONFLICT (Id) DO NOTHING;

INSERT INTO IuinTitles
    (Id, Name, Description, IconStorageKey, Rarity, UnlockHint, SortOrder, CreateAt, UpdateAt)
VALUES
    ('title_research_scout', '研究侦察员', '总能先发现问题边界的人。', 'profile/honors/titles/title_research_scout/title-game.png', 'common', '完成第一版研究主页。', 10, 0, 0),
    ('title_readme_architect', 'README 建筑师', '把个人主页搭成可访问的研究工作室。', 'profile/honors/titles/title_readme_architect/title-game.png', 'common', '整理 README 主页结构。', 20, 0, 0),
    ('title_repro_keeper', '复现守门员', '对可复现有一点温柔的执念。', 'profile/honors/titles/title_repro_keeper/title-game.png', 'rare', '留下可复现实验记录。', 30, 0, 0),
    ('title_night_scribe', '凌晨记录者', '在安静时间把想法写成证据。', 'profile/honors/titles/title_night_scribe/title-game.png', 'rare', '留下夜间研究记录。', 40, 0, 0),
    ('title_bridge_builder', '跨域搭桥人', '让不同角落的人接上同一个问题。', 'profile/honors/titles/title_bridge_builder/title-game.png', 'rare', '获得跨圈层互动。', 50, 0, 0),
    ('title_lit_cartographer', '文献制图师', '把散乱论文画成可行路线。', 'profile/honors/titles/title_lit_cartographer/title-game.png', 'common', '维护文献关系图。', 60, 0, 0),
    ('title_lab_anchor', '实验室锚点', '让团队记忆有可以停靠的地方。', 'profile/honors/titles/title_lab_anchor/title-game.png', 'epic', '多次沉淀团队资料。', 70, 0, 0),
    ('title_question_keeper', '问题保管员', '把暂时无解的问题保管好。', 'profile/honors/titles/title_question_keeper/title-game.png', 'rare', '公开记录未解决问题与下一步。', 80, 0, 0),
    ('title_review_spark', '读书会点火人', '一篇笔记点燃一次真正的集体阅读。', 'profile/honors/titles/title_review_spark/title-game.png', 'epic', '文献笔记引发多人讨论。', 90, 0, 0),
    ('title_future_note', '未来脚注', '给未来的自己留下一张可靠纸条。', 'profile/honors/titles/title_future_note/title-game.png', 'hidden', '在主页或研究状态中写下未来注记。', 100, 0, 0)
ON CONFLICT (Id) DO NOTHING;

INSERT INTO IuinAvatarFrames
    (Id, Name, Description, FrameStorageKey, PreviewStorageKey, Rarity, UnlockHint, SortOrder, CreateAt, UpdateAt)
VALUES
    ('frame_calm_blue', '星海符文', '像游戏里第一枚被点亮的奥术徽环。', 'profile/honors/avatar_frames/frame_calm_blue/frame.png', 'profile/honors/avatar_frames/frame_calm_blue/frame.png', 'common', '默认演示头像框。', 10, 0, 0),
    ('frame_sage_lab', '翡翠守卫', '低调但带一点守护感，适合长期实验。', 'profile/honors/avatar_frames/frame_sage_lab/frame.png', 'profile/honors/avatar_frames/frame_sage_lab/frame.png', 'common', '默认演示头像框。', 20, 0, 0),
    ('frame_warm_note', '琥珀炉心', '像一圈稳定燃烧的锻造火光。', 'profile/honors/avatar_frames/frame_warm_note/frame.png', 'profile/honors/avatar_frames/frame_warm_note/frame.png', 'common', '默认演示头像框。', 30, 0, 0),
    ('frame_clear_mint', '潮汐晶核', '清亮、有流动感，像水系护符。', 'profile/honors/avatar_frames/frame_clear_mint/frame.png', 'profile/honors/avatar_frames/frame_clear_mint/frame.png', 'rare', '默认演示头像框。', 40, 0, 0),
    ('frame_quiet_rose', '蔷薇契约', '不张扬，但有一点稀有装备的完成感。', 'profile/honors/avatar_frames/frame_quiet_rose/frame.png', 'profile/honors/avatar_frames/frame_quiet_rose/frame.png', 'rare', '默认演示头像框。', 50, 0, 0),
    ('frame_graphite', '黑曜刻印', '像秘境门口的一圈黑曜石铭文。', 'profile/honors/avatar_frames/frame_graphite/frame.png', 'profile/honors/avatar_frames/frame_graphite/frame.png', 'common', '后续解锁。', 60, 0, 0),
    ('frame_sunrise', '日冕勋章', '阶段性推进时会亮起来的金色边框。', 'profile/honors/avatar_frames/frame_sunrise/frame.png', 'profile/honors/avatar_frames/frame_sunrise/frame.png', 'rare', '后续解锁。', 70, 0, 0),
    ('frame_tide', '霜蓝回路', '像技能冷却完成时闪过的一圈蓝光。', 'profile/honors/avatar_frames/frame_tide/frame.png', 'profile/honors/avatar_frames/frame_tide/frame.png', 'rare', '后续解锁。', 80, 0, 0),
    ('frame_olive', '古树王冠', '稳稳托住长期主义的史诗绿金边框。', 'profile/honors/avatar_frames/frame_olive/frame.png', 'profile/honors/avatar_frames/frame_olive/frame.png', 'epic', '后续解锁。', 90, 0, 0),
    ('frame_signal', '虚空信标', '像一次被正确接收的紫色研究广播。', 'profile/honors/avatar_frames/frame_signal/frame.png', 'profile/honors/avatar_frames/frame_signal/frame.png', 'epic', '后续解锁。', 100, 0, 0)
ON CONFLICT (Id) DO NOTHING;
