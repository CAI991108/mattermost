// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ReactNode} from 'react';
import React from 'react';

import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {isGuest} from 'mattermost-redux/utils/user_utils';

import * as Menu from 'components/menu';

import MenuItemAutotranslation from '../menu_items/autotranslation';
import MenuItemChannelBookmarks from '../menu_items/channel_bookmarks_submenu';
import MenuItemPluginItems from '../menu_items/plugins_submenu';
import MenuItemToggleMuteChannel from '../menu_items/toggle_mute_channel';
import MenuItemViewPinnedPosts from '../menu_items/view_pinned_posts';

interface Props {
    channel: Channel;
    user: UserProfile;
    isMuted: boolean;
    isMobile: boolean;
    pluginItems: ReactNode[];
    isChannelBookmarksEnabled: boolean;
    isChannelAutotranslated: boolean;
}

const ChannelHeaderDirectMenu = ({channel, user, isMuted, isMobile, pluginItems, isChannelBookmarksEnabled, isChannelAutotranslated}: Props) => {
    return (
        <>
            <MenuItemToggleMuteChannel
                userID={user.id}
                channel={channel}
                isMuted={isMuted}
            />
            {isMobile && (
                <>
                    <MenuItemViewPinnedPosts
                        channelID={channel.id}
                    />
                </>
            )}
            {isChannelAutotranslated && (
                <MenuItemAutotranslation
                    channel={channel}
                />
            )}
            <Menu.Separator/>
            {!isGuest(user.roles) && isChannelBookmarksEnabled && (
                <MenuItemChannelBookmarks
                    channel={channel}
                />
            )}
            {!isMobile && (
                <MenuItemPluginItems pluginItems={pluginItems}/>
            )}
        </>
    );
};

export default ChannelHeaderDirectMenu;
