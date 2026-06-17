// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useRouteMatch} from 'react-router-dom';

import {getProfiles} from 'mattermost-redux/actions/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId, getCurrentUser, getProfiles as selectProfiles, getUserStatuses} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {getDmUnreadByUserId} from 'selectors/direct_messages';
import type {DmUnreadInfo} from 'selectors/direct_messages';

import {getHistory} from 'utils/browser_history';

import DmContactItem from './dm_contact_item';

import type {UserProfile} from '@mattermost/types/users';
import type {GlobalState} from 'types/store';

import './direct_messages_sidebar.scss';

type SortedUser = {
    user: UserProfile;
    dmInfo: DmUnreadInfo | null;
};

function sortUsers(
    users: UserProfile[],
    dmUnreadByUserId: Record<string, DmUnreadInfo>,
    nameDisplaySetting: string,
): SortedUser[] {
    return users
        .map((user) => ({
            user,
            dmInfo: dmUnreadByUserId[user.id] ?? null,
        }))
        .sort((a, b) => {
            const aUnread = a.dmInfo?.unread ?? 0;
            const bUnread = b.dmInfo?.unread ?? 0;
            const aHistory = a.dmInfo?.hasHistory ?? false;
            const bHistory = b.dmInfo?.hasHistory ?? false;
            const aLastPost = a.dmInfo?.lastPostAt ?? 0;
            const bLastPost = b.dmInfo?.lastPostAt ?? 0;

            // 1. Unread first, by last_post_at desc
            if (aUnread > 0 && bUnread === 0) {
                return -1;
            }
            if (bUnread > 0 && aUnread === 0) {
                return 1;
            }
            if (aUnread > 0 && bUnread > 0) {
                return bLastPost - aLastPost;
            }

            // 2. Has history, by last_post_at desc
            if (aHistory && !bHistory) {
                return -1;
            }
            if (bHistory && !aHistory) {
                return 1;
            }
            if (aHistory && bHistory) {
                return bLastPost - aLastPost;
            }

            // 3. No history, alphabetical by displayName
            const aName = displayUsername(a.user, nameDisplaySetting);
            const bName = displayUsername(b.user, nameDisplaySetting);
            return aName.localeCompare(bName);
        });
}

export default function DirectMessagesSidebar() {
    const dispatch = useDispatch();
    const match = useRouteMatch<{identifier?: string}>('/direct_messages/:identifier?');
    const identifierParam = match?.params.identifier ?? null;
    // identifier is @username format, extract username for active highlight
    const activeUsername = identifierParam?.startsWith('@')
        ? identifierParam.slice(1).toLowerCase()
        : null;

    const currentUserId = useSelector(getCurrentUserId);
    const selfUser = useSelector(getCurrentUser);  // getCurrentUser 专门获取当前登录用户
    const allProfiles = useSelector((state: GlobalState) => selectProfiles(state));
    const statuses = useSelector(getUserStatuses);
    const dmUnreadByUserId = useSelector(getDmUnreadByUserId);
    const nameDisplaySetting = useSelector(getTeammateNameDisplaySetting);

    useEffect(() => {
        dispatch(getProfiles(0, 200) as any);
    }, [dispatch]);

    // Exclude deleted users; self is included and participates in normal sorting
    const otherUsers = Object.values(allProfiles).filter(
        (u) => u.delete_at === 0 && u.id !== currentUserId,
    );

    // Merge self into the full list so it participates in sort (unread/history/alpha)
    const allUsers = selfUser && selfUser.delete_at === 0
        ? [...otherUsers, selfUser]
        : otherUsers;

    const sorted = sortUsers(allUsers, dmUnreadByUserId, nameDisplaySetting);

    const handleClick = (username: string) => {
        getHistory().push(`/direct_messages/@${username}`);
    };

    return (
        <div className='dm-sidebar'>
            <div className='dm-sidebar__header'>
                {'私信'}
            </div>
            <div className='dm-sidebar__list'>
                {sorted.map(({user, dmInfo}) => (
                    <DmContactItem
                        key={user.id}
                        user={user}
                        status={statuses[user.id]}
                        unreadCount={dmInfo?.unread ?? 0}
                        isActive={user.username.toLowerCase() === activeUsername}
                        nameDisplaySetting={nameDisplaySetting}
                        onClick={handleClick}
                    />
                ))}
            </div>
        </div>
    );
}
