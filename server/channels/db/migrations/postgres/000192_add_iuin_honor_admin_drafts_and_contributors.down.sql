DROP TABLE IF EXISTS IuinHonorAdminDrafts;

ALTER TABLE IuinAvatarFrames
    DROP COLUMN IF EXISTS ContributorUsername,
    DROP COLUMN IF EXISTS ContributorUserId;

ALTER TABLE IuinTitles
    DROP COLUMN IF EXISTS ContributorUsername,
    DROP COLUMN IF EXISTS ContributorUserId;

ALTER TABLE IuinAchievements
    DROP COLUMN IF EXISTS ContributorUsername,
    DROP COLUMN IF EXISTS ContributorUserId;
