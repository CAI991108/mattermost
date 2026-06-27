// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type ReactNode, useState} from 'react';
import {useIntl} from 'react-intl';

import type {Emoji} from '@mattermost/types/emojis';

import EmojiPicker from 'components/emoji_picker';
import EmojiPickerHeader from 'components/emoji_picker/components/emoji_picker_header';

import type {IuinSticker} from 'utils/iuin_stickers';

export interface Props {
    onEmojiClose: () => void;
    onEmojiClick: (emoji: Emoji) => void;
    onAddCustomEmojiClick?: () => void;
    customEmojiButtonDisabled?: boolean;
    customEmojiButtonLabel?: ReactNode;
    enableIuinStickers?: boolean;
    onStickerClick?: (sticker: IuinSticker) => void;
}

export default function EmojiPickerTabs(props: Props) {
    const intl = useIntl();

    const [filter, setFilter] = useState('');

    return (
        <div
            id='emojiPicker'
            className='a11y__popup emoji-picker emoji-picker--single'
            role='dialog'
            aria-label={intl.formatMessage({id: 'emoji_gif_picker.dialog.emojis', defaultMessage: 'Emoji Picker'})}
            aria-modal='true'
        >
            <EmojiPickerHeader handleEmojiPickerClose={props.onEmojiClose}/>
            <EmojiPicker
                filter={filter}
                onEmojiClick={props.onEmojiClick}
                enableIuinStickers={props.enableIuinStickers}
                onStickerClick={props.onStickerClick}
                handleFilterChange={setFilter}
                handleEmojiPickerClose={props.onEmojiClose}
                customEmojiButtonDisabled={props.customEmojiButtonDisabled}
                customEmojiButtonLabel={props.customEmojiButtonLabel}
                onAddCustomEmojiClick={props.onAddCustomEmojiClick}
            />
        </div>
    );
}
