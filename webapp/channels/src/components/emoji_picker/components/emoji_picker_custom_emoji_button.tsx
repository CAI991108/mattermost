// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, type ReactNode} from 'react';

import {buttonClassNames} from '@mattermost/shared/components/button';

import Permissions from 'mattermost-redux/constants/permissions';

import AnyTeamPermissionGate from 'components/permissions_gates/any_team_permission_gate';

interface Props {
    buttonLabel: ReactNode;
    customEmojisEnabled: boolean;
    disabled?: boolean;
    onClick: () => void;
}

function EmojiPickerCustomEmojiButton({buttonLabel, customEmojisEnabled, disabled, onClick}: Props) {
    if (!customEmojisEnabled) {
        return null;
    }

    return (
        <AnyTeamPermissionGate permissions={[Permissions.CREATE_EMOJIS]}>
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
        </AnyTeamPermissionGate>
    );
}

export default memo(EmojiPickerCustomEmojiButton);
