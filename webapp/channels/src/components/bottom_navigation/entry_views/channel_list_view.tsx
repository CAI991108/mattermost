// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import ChannelNavigator from 'components/sidebar/channel_navigator';
import SidebarList from 'components/sidebar/sidebar_list';
import TeamSwitcher from 'components/team_sidebar/team_switcher';

import './entry_views.scss';

/**
 * The channel list the "channels" entry leads to. The list itself is the one the persistent
 * left sidebar renders; there was no route that carried it before (KTD2, KTD7).
 */
export default function ChannelListView() {
    return (
        <div
            className='entry-view entry-view--sidebar channel-list-view'
            data-testid='channelListView'
        >
            <div className='entry-view__header'>
                <span className='entry-view__title'>
                    <FormattedMessage
                        id='bottom_navigation.channels'
                        defaultMessage='Channels'
                    />
                </span>
                <TeamSwitcher/>
            </div>
            <ChannelNavigator/>
            <SidebarList
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
            />
        </div>
    );
}
