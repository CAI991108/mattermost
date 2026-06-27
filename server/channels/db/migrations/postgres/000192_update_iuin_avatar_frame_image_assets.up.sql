UPDATE IuinAvatarFrames AS frame
SET FrameStorageKey = asset.storage_key,
    PreviewStorageKey = asset.storage_key
FROM (VALUES
    ('frame_calm_blue', 'profile/honors/avatar_frames/frame_calm_blue/frame.png'),
    ('frame_sage_lab', 'profile/honors/avatar_frames/frame_sage_lab/frame.png'),
    ('frame_warm_note', 'profile/honors/avatar_frames/frame_warm_note/frame.png'),
    ('frame_clear_mint', 'profile/honors/avatar_frames/frame_clear_mint/frame.png'),
    ('frame_quiet_rose', 'profile/honors/avatar_frames/frame_quiet_rose/frame.png'),
    ('frame_graphite', 'profile/honors/avatar_frames/frame_graphite/frame.png'),
    ('frame_sunrise', 'profile/honors/avatar_frames/frame_sunrise/frame.png'),
    ('frame_tide', 'profile/honors/avatar_frames/frame_tide/frame.png'),
    ('frame_olive', 'profile/honors/avatar_frames/frame_olive/frame.png'),
    ('frame_signal', 'profile/honors/avatar_frames/frame_signal/frame.png')
) AS asset(id, storage_key)
WHERE frame.Id = asset.id;
