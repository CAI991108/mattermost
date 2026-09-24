// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, type ReactNode} from 'react';

import {buttonClassNames} from '@mattermost/shared/components/button';

interface Props {
    buttonLabel: ReactNode;
    disabled?: boolean;
    onClick: () => void;
}

function EmojiPickerCustomEmojiButton({buttonLabel, disabled, onClick}: Props) {
    return (
        <div className='emoji-picker__custom'>
            <button
                type='button'
                className={buttonClassNames({emphasis: 'tertiary', size: 'sm'})}
                disabled={disabled}
                onClick={onClick}
            >
                {buttonLabel}
            </button>
        </div>
    );
}

export default memo(EmojiPickerCustomEmojiButton);
