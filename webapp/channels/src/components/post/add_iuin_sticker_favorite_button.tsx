// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';

import {EmoticonPlusOutlineIcon} from '@mattermost/compass-icons/components';
import {WithTooltip} from '@mattermost/shared/components/tooltip';

import {favoriteIuinSticker} from 'utils/iuin_stickers';

type Props = {
    postId: string;
    stickerId: string;
};

export default function AddIuinStickerFavoriteButton({postId, stickerId}: Props) {
    const [saving, setSaving] = useState(false);

    const handleClick = useCallback(async () => {
        if (saving) {
            return;
        }

        setSaving(true);
        try {
            await favoriteIuinSticker(stickerId);
        } catch (error) {
            // Keep the hover toolbar quiet; the backend enforces duplicate and limit rules.
            // eslint-disable-next-line no-console
            console.error(error);
        } finally {
            setSaving(false);
        }
    }, [saving, stickerId]);

    return (
        <WithTooltip title='添加表情'>
            <button
                id={`add_sticker_${postId}`}
                data-testid={`add_sticker_${postId}`}
                type='button'
                aria-label='添加表情'
                className='post-menu__item'
                disabled={saving}
                onClick={handleClick}
            >
                <EmoticonPlusOutlineIcon
                    className='icon icon--small'
                    size={16}
                />
            </button>
        </WithTooltip>
    );
}
