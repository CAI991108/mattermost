// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';

import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import SidebarBrowseOrAddChannelMenu from './sidebar_browse_or_add_channel_menu';
import SidebarTeamMenu from './sidebar_team_menu';

import './sidebar_header.scss';

export type Props = {
    showNewChannelModal: () => void;
    showMoreChannelsModal: () => void;
    showCreateUserGroupModal: () => void;
    invitePeopleModal: () => void;
    canCreateChannel: boolean;
    canJoinPublicChannel: boolean;
    // LZX: 移除 handleOpenDirectMessagesModal，私信入口已改为侧边栏静态入口
    unreadFilterEnabled: boolean;
    canCreateCustomGroups: boolean;
}

const SidebarHeader = (props: Props) => {
    const currentTeam = useSelector(getCurrentTeam);

    if (!currentTeam) {
        return null;
    }

    return (
        <div className='sidebarHeaderContainer'>
            <SidebarTeamMenu currentTeam={currentTeam}/>
            {(props.canCreateChannel || props.canJoinPublicChannel) && (
                <SidebarBrowseOrAddChannelMenu
                    canCreateChannel={props.canCreateChannel}
                    onCreateNewChannelClick={props.showNewChannelModal}
                    canJoinPublicChannel={props.canJoinPublicChannel}
                    onBrowseChannelClick={props.showMoreChannelsModal}
                    canCreateCustomGroups={props.canCreateCustomGroups}
                    onCreateNewUserGroupClick={props.showCreateUserGroupModal}
                    unreadFilterEnabled={props.unreadFilterEnabled}
                    onInvitePeopleClick={props.invitePeopleModal}
                />
            )}
        </div>
    );
};

export default SidebarHeader;
