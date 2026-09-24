UPDATE IuinTitles
SET IconStorageKey = '',
    UpdateAt = 0
WHERE Id IN (
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
