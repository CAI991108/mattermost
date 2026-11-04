// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';

import {
    isChannelAutotranslated as isChannelAutotranslatedSelector,
    getCurrentChannel,
    isCurrentChannelDefault,
    isCurrentChannelMuted,
} from 'mattermost-redux/selectors/entities/channels';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {getChannelHeaderMenuPluginComponents} from 'selectors/plugins';

import {getIsChannelBookmarksEnabled} from 'components/channel_bookmarks/utils';
import * as Menu from 'components/menu';

import {Constants} from 'utils/constants';

import type {GlobalState} from 'types/store';

import ChannelDirectMenu from './channel_header_menu_items/channel_header_direct_menu';
import ChannelGroupMenu from './channel_header_menu_items/channel_header_group_menu';
import ChannelHeaderMobileMenu from './channel_header_menu_items/channel_header_mobile_menu';
import ChannelPublicPrivateMenu from './channel_header_menu_items/channel_header_public_private_menu';
import {usePluginVisibilityInSharedChannel} from '../common/hooks/usePluginVisibilityInSharedChannel';

export type Props = {

    /**
     * Whether the items are shown on a narrow screen. It changes what the menu offers (the
     * pinned posts shortcut and the plugin entries) and, on a narrow screen, makes an item act
     * on the first click instead of waiting for a menu to close.
     */
    isMobile?: boolean;

    /**
     * Whether the pinned posts shortcut is offered. The conversation information page has a
     * section of its own for pinned posts, so it drops the shortcut; the header menu keeps it.
     */
    showPinnedPosts?: boolean;
};

/**
 * The channel menu's content, without the button that opens it.
 *
 * The header keeps it in a popover, and the conversation information page renders the same list
 * as the body of its settings section (R9, R10). Both places therefore offer exactly the same
 * operations, in the same order, without the list being written twice: an item added to the menu
 * appears in both. A submenu item inside a plain container becomes the submenu's own modal on a
 * narrow screen, which is what this list relies on.
 */
export default function ChannelHeaderMenuItems({isMobile, showPinnedPosts = true}: Props): JSX.Element | null {
    const user = useSelector(getCurrentUser);
    const channel = useSelector(getCurrentChannel);
    const isDefault = useSelector(isCurrentChannelDefault);
    const isMuted = useSelector(isCurrentChannelMuted);
    const isLicensedForLDAPGroups = useSelector(getLicense).LDAPGroups === 'true';
    const pluginMenuItems = useSelector(getChannelHeaderMenuPluginComponents);
    const isChannelBookmarksEnabled = useSelector(getIsChannelBookmarksEnabled);
    const pluginItemsVisible = usePluginVisibilityInSharedChannel(channel?.id);
    const isChannelAutotranslated = useSelector((state: GlobalState) => (channel?.id ? isChannelAutotranslatedSelector(state, channel.id) : false));

    const isReadonly = false;

    if (!channel) {
        return null;
    }

    const isDirect = (channel.type === Constants.DM_CHANNEL);
    const isGroup = (channel.type === Constants.GM_CHANNEL);

    let pluginItems: JSX.Element[] = [];

    if (pluginItemsVisible) {
        pluginItems = pluginMenuItems.map((item) => {
            const handlePluginItemClick = () => {
                if (item.action) {
                    item.action(channel.id);
                }
            };

            return (
                <Menu.Item
                    id={item.id + '_pluginmenuitem'}
                    key={item.id + '_pluginmenuitem'}
                    onClick={handlePluginItemClick}
                    labels={<span>{item.text}</span>}
                />
            );
        });
    }

    return (
        <>
            {isDirect && (
                <ChannelDirectMenu
                    channel={channel}
                    user={user}
                    isMuted={isMuted}
                    pluginItems={pluginItems}
                    isMobile={isMobile || false}
                    isChannelBookmarksEnabled={isChannelBookmarksEnabled}
                    isChannelAutotranslated={isChannelAutotranslated}
                />
            )}
            {isGroup && (
                <ChannelGroupMenu
                    channel={channel}
                    user={user}
                    isMuted={isMuted}
                    pluginItems={pluginItems}
                    isMobile={isMobile || false}
                    isChannelBookmarksEnabled={isChannelBookmarksEnabled}
                    isChannelAutotranslated={isChannelAutotranslated}
                />
            )}
            {(!isDirect && !isGroup) && (
                <ChannelPublicPrivateMenu
                    channel={channel}
                    user={user}
                    isMuted={isMuted}
                    pluginItems={pluginItems}
                    isMobile={isMobile || false}
                    isDefault={isDefault}
                    isReadonly={isReadonly}
                    isLicensedForLDAPGroups={isLicensedForLDAPGroups}
                    isChannelBookmarksEnabled={isChannelBookmarksEnabled}
                    isChannelAutotranslated={isChannelAutotranslated}
                    showPinnedPosts={showPinnedPosts}
                />
            )}

            <ChannelHeaderMobileMenu
                isMobile={isMobile || false}
                pluginItems={pluginItems}
                channel={channel}
            />
        </>
    );
}
