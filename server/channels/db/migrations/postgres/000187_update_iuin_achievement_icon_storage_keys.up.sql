UPDATE IuinAchievements
SET IconStorageKey = values.IconStorageKey,
    UpdateAt = 0
FROM (
    VALUES
        ('achv_profile_anchor', 'profile/honors/achievements/achv_profile_anchor/icon.png'),
        ('achv_readme_door', 'profile/honors/achievements/achv_readme_door/icon.png'),
        ('achv_late_trace', 'profile/honors/achievements/achv_late_trace/icon.png'),
        ('achv_echo_beyond', 'profile/honors/achievements/achv_echo_beyond/icon.png'),
        ('achv_repro_seed', 'profile/honors/achievements/achv_repro_seed/icon.png'),
        ('achv_lit_skeleton', 'profile/honors/achievements/achv_lit_skeleton/icon.png'),
        ('achv_decision_trace', 'profile/honors/achievements/achv_decision_trace/icon.png'),
        ('achv_code_signpost', 'profile/honors/achievements/achv_code_signpost/icon.png'),
        ('achv_homepage_cited', 'profile/honors/achievements/achv_homepage_cited/icon.png'),
        ('achv_gallery_curator', 'profile/honors/achievements/achv_gallery_curator/icon.png')
) AS values(Id, IconStorageKey)
WHERE IuinAchievements.Id = values.Id
    AND IuinAchievements.DeleteAt = 0;
