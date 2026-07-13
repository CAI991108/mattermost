UPDATE IuinAchievements
SET IconStorageKey = '',
    UpdateAt = 0
WHERE Id IN (
    'achv_profile_anchor',
    'achv_readme_door',
    'achv_late_trace',
    'achv_echo_beyond',
    'achv_repro_seed',
    'achv_lit_skeleton',
    'achv_decision_trace',
    'achv_code_signpost',
    'achv_homepage_cited',
    'achv_gallery_curator'
);
