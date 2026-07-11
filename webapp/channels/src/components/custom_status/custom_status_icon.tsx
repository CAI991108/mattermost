// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {CSSProperties, KeyboardEvent, MouseEvent} from 'react';

import RenderEmoji from 'components/emoji/render_emoji';

import {getIuinStatusImageUrl, getIuinStatusImageUrlById, isIuinStatusImageToken} from 'utils/iuin_status_images';

type Props = {
    emojiName: string;
    statusEmojiId?: string;
    size?: number;
    emojiStyle?: CSSProperties;
    onClick?: (event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) => void;
};

export default function CustomStatusIcon({emojiName, statusEmojiId, size = 16, emojiStyle, onClick}: Props) {
    if (!statusEmojiId && !isIuinStatusImageToken(emojiName)) {
        return (
            <RenderEmoji
                emojiName={emojiName}
                size={size}
                emojiStyle={emojiStyle}
                onClick={onClick}
            />
        );
    }

    const image = (
        <img
            src={statusEmojiId ? getIuinStatusImageUrlById(statusEmojiId) : getIuinStatusImageUrl(emojiName)}
            alt=''
            style={{width: '100%', height: '100%', objectFit: 'contain'}}
        />
    );
    const style = {
        display: 'inline-flex',
        width: size,
        height: size,
        ...emojiStyle,
    };

    if (onClick) {
        return (
            <button
                type='button'
                className='custom-status-image'
                style={{border: 0, padding: 0, background: 'transparent', ...style}}
                onClick={(event) => onClick(event as unknown as MouseEvent<HTMLSpanElement>)}
            >
                {image}
            </button>
        );
    }

    return (
        <span
            className='custom-status-image'
            style={style}
        >
            {image}
        </span>
    );
}
