UPDATE IuinTitles
SET IconStorageKey = values.IconStorageKey,
    UpdateAt = 0
FROM (
    VALUES
        ('title_research_scout', 'profile/honors/titles/title_research_scout/title-game.png'),
        ('title_readme_architect', 'profile/honors/titles/title_readme_architect/title-game.png'),
        ('title_repro_keeper', 'profile/honors/titles/title_repro_keeper/title-game.png'),
        ('title_night_scribe', 'profile/honors/titles/title_night_scribe/title-game.png'),
        ('title_bridge_builder', 'profile/honors/titles/title_bridge_builder/title-game.png'),
        ('title_lit_cartographer', 'profile/honors/titles/title_lit_cartographer/title-game.png'),
        ('title_lab_anchor', 'profile/honors/titles/title_lab_anchor/title-game.png'),
        ('title_question_keeper', 'profile/honors/titles/title_question_keeper/title-game.png'),
        ('title_review_spark', 'profile/honors/titles/title_review_spark/title-game.png'),
        ('title_future_note', 'profile/honors/titles/title_future_note/title-game.png')
) AS values(Id, IconStorageKey)
WHERE IuinTitles.Id = values.Id
    AND IuinTitles.DeleteAt = 0;
