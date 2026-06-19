// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, type ReactNode} from 'react';
import {FormattedMessage} from 'react-intl';
import {Link} from 'react-router-dom';

import {buttonClassNames} from '@mattermost/shared/components/button';

import Permissions from 'mattermost-redux/constants/permissions';

import AnyTeamPermissionGate from 'components/permissions_gates/any_team_permission_gate';

interface Props {
    buttonLabel?: ReactNode;
    buttonIsAction?: boolean;
    customEmojisEnabled: boolean;
    currentTeamName: string;
    disabled?: boolean;
    onClick: () => void;
}

function EmojiPickerCustomEmojiButton({buttonLabel, buttonIsAction, customEmojisEnabled, currentTeamName, disabled, onClick}: Props) {
    if (!customEmojisEnabled) {
        return null;
    }

    if (!buttonIsAction && currentTeamName.length === 0) {
        return null;
    }

    const label = buttonLabel || (
        <FormattedMessage
            id='emoji_picker.custom_emoji'
            defaultMessage='Custom Emoji'
        />
    );

    return (
        <AnyTeamPermissionGate permissions={[Permissions.CREATE_EMOJIS]}>
            <div className='emoji-picker__custom'>
                {buttonIsAction ? (
                    <button
                        type='button'
                        className={buttonClassNames({emphasis: 'tertiary', size: 'sm'})}
                        disabled={disabled}
                        onClick={onClick}
                    >
                        {label}
                    </button>
                ) : (
                    <Link
                        className={buttonClassNames({emphasis: 'tertiary', size: 'sm'})}
                        to={`/${currentTeamName}/emoji`}
                        onClick={onClick}
                    >
                        {label}
                    </Link>
                )}
            </div>
        </AnyTeamPermissionGate>
    );
}

export default memo(EmojiPickerCustomEmojiButton);
