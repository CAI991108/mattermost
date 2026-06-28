// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import {WithTooltip} from '@mattermost/shared/components/tooltip';

import {openModal} from 'actions/views/modals';
import IconButton from 'components/global_header/header_icon_button';
import KeyboardShortcutsModal from 'components/keyboard_shortcuts/keyboard_shortcuts_modal/keyboard_shortcuts_modal';

import {ModalIdentifiers} from 'utils/constants';

const KeyboardShortcutsButton = (): JSX.Element => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        dispatch(openModal({
            modalId: ModalIdentifiers.KEYBOARD_SHORTCUTS_MODAL,
            dialogType: KeyboardShortcutsModal,
        }));
    };

    return (
        <WithTooltip
            title={
                <FormattedMessage
                    id='userGuideHelp.keyboardShortcuts'
                    defaultMessage='Keyboard shortcuts'
                />
            }
        >
            <IconButton
                icon={'keyboard-outline'}
                onClick={handleClick}
                aria-haspopup='dialog'
                aria-label={formatMessage({id: 'userGuideHelp.keyboardShortcuts', defaultMessage: 'Keyboard shortcuts'})}
            />
        </WithTooltip>
    );
};

export default KeyboardShortcutsButton;
