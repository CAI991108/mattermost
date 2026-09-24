UPDATE IuinAvatarFrames AS frame
SET FrameStorageKey = '',
    PreviewStorageKey = ''
FROM (VALUES
    ('frame_calm_blue'),
    ('frame_sage_lab'),
    ('frame_warm_note'),
    ('frame_clear_mint'),
    ('frame_quiet_rose'),
    ('frame_graphite'),
    ('frame_sunrise'),
    ('frame_tide'),
    ('frame_olive'),
    ('frame_signal')
) AS asset(id)
WHERE frame.Id = asset.id;
