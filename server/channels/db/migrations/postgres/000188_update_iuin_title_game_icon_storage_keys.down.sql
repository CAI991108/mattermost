UPDATE IuinTitles
SET IconStorageKey = values.IconStorageKey,
    UpdateAt = 0
FROM (
    VALUES
        ('title_research_scout', 'profile/honors/titles/title_research_scout/title.png'),
        ('title_readme_architect', 'profile/honors/titles/title_readme_architect/title.png'),
        ('title_repro_keeper', 'profile/honors/titles/title_repro_keeper/title.png'),
        ('title_night_scribe', 'profile/honors/titles/title_night_scribe/title.png'),
        ('title_bridge_builder', 'profile/honors/titles/title_bridge_builder/title.png'),
        ('title_lit_cartographer', 'profile/honors/titles/title_lit_cartographer/title.png'),
        ('title_lab_anchor', 'profile/honors/titles/title_lab_anchor/title.png'),
        ('title_question_keeper', 'profile/honors/titles/title_question_keeper/title.png'),
        ('title_review_spark', 'profile/honors/titles/title_review_spark/title.png'),
        ('title_future_note', 'profile/honors/titles/title_future_note/title.png')
) AS values(Id, IconStorageKey)
WHERE IuinTitles.Id = values.Id
    AND IuinTitles.DeleteAt = 0;
