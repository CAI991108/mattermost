// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ReactNode} from 'react';
import React from 'react';

import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {Permissions} from 'mattermost-redux/constants';
import {isGuest} from 'mattermost-redux/utils/user_utils';

import * as Menu from 'components/menu';
import ChannelPermissionGate from 'components/permissions_gates/channel_permission_gate';

import {Constants} from 'utils/constants';

import MenuItemArchiveChannel from '../menu_items/archive_channel';
import MenuItemAutotranslation from '../menu_items/autotranslation';
import MenuItemChannelBookmarks from '../menu_items/channel_bookmarks_submenu';
import MenuItemChannelSettings from '../menu_items/channel_settings_menu';
import MenuItemCloseChannel from '../menu_items/close_channel';
import MenuItemGroupsMenuItems from '../menu_items/groups';
import MenuItemLeaveChannel from '../menu_items/leave_channel';
import MenuItemPluginItems from '../menu_items/plugins_submenu';
import MenuItemUnarchiveChannel from '../menu_items/unarchive_channel';
import MenuItemViewPinnedPosts from '../menu_items/view_pinned_posts';

interface Props extends Menu.FirstMenuItemProps {
    channel: Channel;
    user: UserProfile;
    isMuted: boolean;
    isReadonly: boolean;
    isDefault: boolean;
    isMobile: boolean;
    isLicensedForLDAPGroups: boolean;
    pluginItems: ReactNode[];
    isChannelBookmarksEnabled: boolean;
    isChannelAutotranslated: boolean;
}

const ChannelHeaderPublicMenu = ({channel, user, isDefault, isMobile, isLicensedForLDAPGroups, pluginItems, isChannelBookmarksEnabled, isChannelAutotranslated, ...rest}: Props) => {
    const isGroupConstrained = channel?.group_constrained === true;
    const isArchived = channel.delete_at !== 0;
    const isPrivate = channel?.type === Constants.PRIVATE_CHANNEL;

    const channelMembersPermission = isPrivate ? Permissions.MANAGE_PRIVATE_CHANNEL_MEMBERS : Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS;
    const channelDeletePermission = isPrivate ? Permissions.DELETE_PRIVATE_CHANNEL : Permissions.DELETE_PUBLIC_CHANNEL;
    const channelUnarchivePermission = Permissions.MANAGE_TEAM;

    const showGroupsMenu = !isArchived && !isDefault && isGroupConstrained && isLicensedForLDAPGroups;
    const showPrimarySection = !isArchived || isChannelAutotranslated || isMobile || showGroupsMenu;
    const showPluginSection = !isMobile && pluginItems.length > 0;
    const showDestructiveSection = !isDefault || isArchived;

    return (
        <>
            {!isArchived && (
                <>
                    <MenuItemChannelSettings
                        channel={channel}
                        {...rest}
                    />
                    {isChannelBookmarksEnabled && (
                        <MenuItemChannelBookmarks
                            channel={channel}
                        />
                    )}
                </>
            )}
            {isChannelAutotranslated && (
                <MenuItemAutotranslation
                    channel={channel}
                />
            )}
            {isMobile && (
                <MenuItemViewPinnedPosts
                    channelID={channel.id}
                />
            )}

            {showGroupsMenu && (
                <ChannelPermissionGate
                    channelId={channel.id}
                    teamId={channel.team_id}
                    permissions={[channelMembersPermission]}
                >
                    <MenuItemGroupsMenuItems
                        channel={channel}
                    />
                </ChannelPermissionGate>
            )}

            {showPrimarySection && (showPluginSection || showDestructiveSection) && <Menu.Separator/>}
            {showPluginSection && (
                <MenuItemPluginItems pluginItems={pluginItems}/>
            )}
            {showPluginSection && showDestructiveSection && (
                <Menu.Separator/>
            )}
            {!isDefault && !isGuest(user.roles) && (
                <MenuItemLeaveChannel
                    id='channelLeaveChannel'
                    channel={channel}
                />
            )}

            {isArchived && (
                <MenuItemCloseChannel/>
            )}

            {!isArchived && !isDefault && (
                <ChannelPermissionGate
                    channelId={channel.id}
                    teamId={channel.team_id}
                    permissions={[channelDeletePermission]}
                >
                    <MenuItemArchiveChannel
                        channel={channel}
                    />
                </ChannelPermissionGate>
            )}

            {isArchived && !isDefault && (
                <ChannelPermissionGate
                    channelId={channel.id}
                    teamId={channel.team_id}
                    permissions={[channelUnarchivePermission]}
                >
                    <MenuItemUnarchiveChannel
                        channel={channel}
                    />
                </ChannelPermissionGate>
            )}
        </>
    );
};

export default ChannelHeaderPublicMenu;
