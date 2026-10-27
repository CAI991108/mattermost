// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {fetchMyCategories} from 'mattermost-redux/actions/channel_categories';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import ChannelNavigator from 'components/sidebar/channel_navigator';
import SidebarList from 'components/sidebar/sidebar_list';
import TeamSwitcher from 'components/team_sidebar/team_switcher';

import './entry_views.scss';

/**
 * The channel list the "channels" entry leads to, in the one column the narrow shell has. The
 * sidebar renders the same list everywhere else; this page replaces it there, so it also takes over
 * loading the categories the list is grouped by (KTD2, KTD7).
 */
export default function ChannelListView() {
    const dispatch = useDispatch();
    const teamId = useSelector(getCurrentTeam)?.id;

    useEffect(() => {
        if (teamId) {
            dispatch(fetchMyCategories(teamId));
        }
    }, [dispatch, teamId]);

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
            <div className='SidebarContainer--inline'>
                <ChannelNavigator/>
                <SidebarList
                    onDragStart={() => undefined}
                    onDragEnd={() => undefined}
                />
            </div>
        </div>
    );
}
