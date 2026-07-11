ALTER TABLE IuinTitles
    ADD COLUMN IF NOT EXISTS Category VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE IuinAvatarFrames
    ADD COLUMN IF NOT EXISTS Category VARCHAR(64) NOT NULL DEFAULT '';

UPDATE IuinTitles
SET Category = CASE Id
    WHEN 'title_research_scout' THEN 'profile'
    WHEN 'title_readme_architect' THEN 'profile'
    WHEN 'title_repro_keeper' THEN 'experiment'
    WHEN 'title_night_scribe' THEN 'collaboration'
    WHEN 'title_bridge_builder' THEN 'collaboration'
    WHEN 'title_lit_cartographer' THEN 'literature'
    WHEN 'title_lab_anchor' THEN 'meeting'
    WHEN 'title_question_keeper' THEN 'experiment'
    WHEN 'title_review_spark' THEN 'literature'
    WHEN 'title_future_note' THEN 'profile'
    ELSE Category
END
WHERE Category = ''
    AND Id IN (
        'title_research_scout',
        'title_readme_architect',
        'title_repro_keeper',
        'title_night_scribe',
        'title_bridge_builder',
        'title_lit_cartographer',
        'title_lab_anchor',
        'title_question_keeper',
        'title_review_spark',
        'title_future_note'
    );

UPDATE IuinAvatarFrames
SET Category = CASE Id
    WHEN 'frame_calm_blue' THEN 'profile'
    WHEN 'frame_sage_lab' THEN 'experiment'
    WHEN 'frame_warm_note' THEN 'meeting'
    WHEN 'frame_clear_mint' THEN 'literature'
    WHEN 'frame_quiet_rose' THEN 'collaboration'
    WHEN 'frame_graphite' THEN 'experiment'
    WHEN 'frame_sunrise' THEN 'meeting'
    WHEN 'frame_tide' THEN 'literature'
    WHEN 'frame_olive' THEN 'profile'
    WHEN 'frame_signal' THEN 'collaboration'
    ELSE Category
END
WHERE Category = ''
    AND Id IN (
        'frame_calm_blue',
        'frame_sage_lab',
        'frame_warm_note',
        'frame_clear_mint',
        'frame_quiet_rose',
        'frame_graphite',
        'frame_sunrise',
        'frame_tide',
        'frame_olive',
        'frame_signal'
    );
