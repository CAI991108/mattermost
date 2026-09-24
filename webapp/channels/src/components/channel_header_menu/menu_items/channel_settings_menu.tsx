// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {
    CogOutlineIcon,
} from '@mattermost/compass-icons/components';
import type {Channel} from '@mattermost/types/channels';

import {openModal} from 'actions/views/modals';
import {canAccessChannelSettings} from 'selectors/views/channel_settings';

import ChannelSettingsModal from 'components/channel_settings_modal/channel_settings_modal';
import * as Menu from 'components/menu';

import {ModalIdentifiers} from 'utils/constants';

import type {GlobalState} from 'types/store';

type Props = Menu.FirstMenuItemProps & {
    channel: Channel;
}

const ChannelSettingsMenu = ({channel, ...rest}: Props): JSX.Element | null => {
    const dispatch = useDispatch();
    const canAccess = useSelector((state: GlobalState) => canAccessChannelSettings(state, channel.id));

    // Don't render the menu item if the user doesn't have access to any channel settings tab
    if (!canAccess) {
        return null;
    }

    const handleOpenChannelSettings = () => {
        dispatch(
            openModal({
                modalId: ModalIdentifiers.CHANNEL_SETTINGS,
                dialogType: ChannelSettingsModal,
                dialogProps: {
                    channelId: channel.id,
                    focusOriginElement: 'channelHeaderDropdownButton',
                    isOpen: true,
                },
            }),
        );
    };

    return (
        <Menu.Item
            id={'channelSettings'}
            labels={
                <FormattedMessage
                    id='channel_header.channel_settings'
                    defaultMessage='Channel Settings'
                />
            }
            onClick={handleOpenChannelSettings}
            leadingElement={<CogOutlineIcon size={18}/>}
            {...rest}
        />
    );
};

export default memo(ChannelSettingsMenu);
