// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';

import {DotsVerticalIcon} from '@mattermost/compass-icons/components';
import type {UserProfile} from '@mattermost/types/users';

import {displayUsername} from 'mattermost-redux/utils/user_utils';

import CustomStatusEmoji from 'components/custom_status/custom_status_emoji';
import * as Menu from 'components/menu';
import ProfilePicture from 'components/profile_picture';
import ProfilePopover from 'components/profile_popover';
import MenuItemToggleMuteChannel from 'components/channel_header_menu/menu_items/toggle_mute_channel';
import * as Utils from 'utils/utils';

type Props = {
    user: UserProfile;
    currentUserId: string;
    channelId: string;
    isMuted: boolean;
    status?: string;
    unreadCount: number;
    isActive: boolean;
    nameDisplaySetting: string;
    onClick: (userId: string) => void;
};

export default function DmContactItem({
    user,
    currentUserId,
    channelId,
    isMuted,
    status,
    unreadCount,
    isActive,
    nameDisplaySetting,
    onClick,
}: Props) {
    const {formatMessage} = useIntl();
    const [menuOpen, setMenuOpen] = useState(false);
    const displayName = displayUsername(user, nameDisplaySetting);
    const userProfileSrc = Utils.imageURLForUser(user.id, user.last_picture_update);

    const handleClick = () => onClick(user.username);

    // Construct a minimal channel-like object for MenuItemToggleMuteChannel
    const channelForMute = {id: channelId, type: 'D'} as any;

    return (
        <div
            className={`dm-contact-item${isActive ? ' dm-contact-item--active' : ''}${menuOpen ? ' dm-contact-item--menu-open' : ''}${isMuted ? ' dm-contact-item--muted' : ''}`}
        >
            <ProfilePopover
                triggerComponentClass='dm-contact-item__avatar'
                userId={user.id}
                src={userProfileSrc}
                hideStatus={user.is_bot}
            >
                <div className='dm-contact-item__avatar-inner'>
                    <ProfilePicture
                        size='sm'
                        status={status}
                        isBot={user.is_bot}
                        userId={user.id}
                        username={user.username}
                        src={userProfileSrc}
                    />
                </div>
            </ProfilePopover>
            <button
                type='button'
                className='dm-contact-item__info-btn'
                onClick={handleClick}
                aria-label={displayName}
            >
                <span className='dm-contact-item__display-name'>
                    {displayName}
                </span>
                {displayName !== user.username && (
                    <span className='dm-contact-item__username'>
                        {'@'}{user.username}
                    </span>
                )}
                <CustomStatusEmoji
                    userID={user.id}
                    showTooltip={true}
                    emojiSize={14}
                />
            </button>
            <div className='dm-contact-item__badges'>
                {unreadCount > 0 && !menuOpen && (
                    <span className='dm-contact-item__unread-badge'>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
                <Menu.Container
                    menuButton={{
                        id: `DmContactMenu-Button-${user.id}`,
                        class: 'dm-contact-item__menu-btn',
                        'aria-label': formatMessage({
                            id: 'dm_contact.menu.ariaLabel',
                            defaultMessage: 'Options for {name}',
                        }, {name: displayName}),
                        children: <DotsVerticalIcon size={16}/>,
                    }}
                    menu={{
                        id: `DmContactMenu-MenuList-${user.id}`,
                        'aria-label': formatMessage({
                            id: 'dm_contact.menu.ariaLabel',
                            defaultMessage: 'Options for {name}',
                        }, {name: displayName}),
                        onToggle: setMenuOpen,
                    }}
                >
                    <MenuItemToggleMuteChannel
                        userID={currentUserId}
                        channel={channelForMute}
                        isMuted={isMuted}
                    />
                </Menu.Container>
            </div>
        </div>
    );
}
