// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {displayUsername} from 'mattermost-redux/utils/user_utils';

import CustomStatusEmoji from 'components/custom_status/custom_status_emoji';
import ProfilePicture from 'components/profile_picture';
import ProfilePopover from 'components/profile_popover';
import * as Utils from 'utils/utils';

import type {UserProfile} from '@mattermost/types/users';

type Props = {
    user: UserProfile;
    status?: string;
    unreadCount: number;
    isActive: boolean;
    nameDisplaySetting: string;
    onClick: (userId: string) => void;
};

export default function DmContactItem({
    user,
    status,
    unreadCount,
    isActive,
    nameDisplaySetting,
    onClick,
}: Props) {
    const displayName = displayUsername(user, nameDisplaySetting);
    const userProfileSrc = Utils.imageURLForUser(user.id, user.last_picture_update);

    const handleClick = () => onClick(user.username);

    return (
        <div
            className={`dm-contact-item${isActive ? ' dm-contact-item--active' : ''}`}
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
                {unreadCount > 0 && (
                    <span className='dm-contact-item__unread-badge'>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </div>
        </div>
    );
}
