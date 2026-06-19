// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useCallback, useMemo, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useRouteMatch} from 'react-router-dom';

import {getProfiles, getTotalUsersStats} from 'mattermost-redux/actions/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId, getCurrentUser, getProfiles as selectProfiles, getUserStatuses, getTotalUsersStats as getTotalUsersStatsSelector} from 'mattermost-redux/selectors/entities/users';

import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {openModal} from 'actions/views/modals';
import {getDmUnreadByUserId} from 'selectors/direct_messages';
import type {DmUnreadInfo} from 'selectors/direct_messages';
import {ModalIdentifiers} from 'utils/constants';
import {getHistory} from 'utils/browser_history';

import MoreDirectChannels from 'components/more_direct_channels';

import DmContactItem from './dm_contact_item';

import type {UserProfile} from '@mattermost/types/users';
import type {GlobalState} from 'types/store';

import './direct_messages_sidebar.scss';

const DM_USERS_PAGE_SIZE = 200;

type SortedUser = {
    user: UserProfile;
    dmInfo: DmUnreadInfo | null;
};

function toSortedUsers(
    users: UserProfile[],
    dmUnreadByUserId: Record<string, DmUnreadInfo>,
): SortedUser[] {
    return users.map((user) => ({
        user,
        dmInfo: dmUnreadByUserId[user.id] ?? null,
    }));
}

function sortRecentUsers(users: SortedUser[]): SortedUser[] {
    return users
        .filter(({dmInfo}) => dmInfo?.hasHistory)
        .sort((a, b) => (b.dmInfo?.lastPostAt ?? 0) - (a.dmInfo?.lastPostAt ?? 0))
        .slice(0, 20);
}

function sortAllUsersByDisplayName(users: SortedUser[], nameDisplaySetting: string): SortedUser[] {
    return [...users].sort((a, b) => {
        const aName = displayUsername(a.user, nameDisplaySetting);
        const bName = displayUsername(b.user, nameDisplaySetting);
        return aName.localeCompare(bName);
    });
}

export default function DirectMessagesSidebar() {
    const dispatch = useDispatch();
    const match = useRouteMatch<{identifier?: string}>('/direct_messages/:identifier?');
    const identifierParam = match?.params.identifier ?? null;
    // identifier supports @username and plain userId fallback.
    const activeUsername = identifierParam?.startsWith('@')
        ? identifierParam.slice(1).toLowerCase()
        : null;
    const activeUserId = identifierParam && !identifierParam.startsWith('@') ? identifierParam : null;

    const currentUserId = useSelector(getCurrentUserId);
    const selfUser = useSelector(getCurrentUser);  // getCurrentUser 专门获取当前登录用户
    const allProfiles = useSelector((state: GlobalState) => selectProfiles(state));
    const statuses = useSelector(getUserStatuses);
    const dmUnreadByUserId = useSelector(getDmUnreadByUserId);
    const nameDisplaySetting = useSelector(getTeammateNameDisplaySetting);
    const totalUsersCount = useSelector((state: GlobalState) => getTotalUsersStatsSelector(state)?.total_users_count ?? 0);

    useEffect(() => {
        dispatch(getTotalUsersStats() as any);
        dispatch(getProfiles(0, DM_USERS_PAGE_SIZE) as any);
    }, [dispatch]);

    useEffect(() => {
        if (totalUsersCount <= DM_USERS_PAGE_SIZE) {
            return;
        }

        const pageCount = Math.ceil(totalUsersCount / DM_USERS_PAGE_SIZE);
        for (let page = 1; page < pageCount; page++) {
            dispatch(getProfiles(page, DM_USERS_PAGE_SIZE) as any);
        }
    }, [dispatch, totalUsersCount]);

    // Exclude deleted users; self is included and participates in normal sorting
    const otherUsers = Object.values(allProfiles).filter(
        (u) => u.delete_at === 0 && u.id !== currentUserId,
    );

    // Merge self into the full list so it participates in sort (unread/history/alpha)
    const allUsers = selfUser && selfUser.delete_at === 0
        ? [...otherUsers, selfUser]
        : otherUsers;

    const [isRecentOpen, setIsRecentOpen] = useState(true);
    const [isAllMembersOpen, setIsAllMembersOpen] = useState(false);

    const sortedUsers = useMemo(() => toSortedUsers(allUsers, dmUnreadByUserId), [allUsers, dmUnreadByUserId]);
    const recentUsers = useMemo(() => sortRecentUsers(sortedUsers), [sortedUsers]);
    const displayedRecentUsers = useMemo(() => {
        const activeUser = sortedUsers.find(({user}) => (
            (activeUsername && user.username.toLowerCase() === activeUsername) ||
            (activeUserId && user.id === activeUserId)
        ));
        if (!activeUser || recentUsers.some(({user}) => user.id === activeUser.user.id)) {
            return recentUsers;
        }
        return [activeUser, ...recentUsers];
    }, [activeUsername, activeUserId, recentUsers, sortedUsers]);

    const allMembers = useMemo(() => sortAllUsersByDisplayName(sortedUsers, nameDisplaySetting), [sortedUsers, nameDisplaySetting]);

    const handleClick = (username: string) => {
        getHistory().push(`/direct_messages/@${username}`);
    };

    const handleOpenSearch = useCallback(() => {
        dispatch(openModal({
            modalId: ModalIdentifiers.CREATE_DM_CHANNEL,
            dialogType: MoreDirectChannels,
            dialogProps: {
                isExistingChannel: false,
                focusOriginElement: 'dm-sidebar-search-btn',
            },
        }));
    }, [dispatch]);

    return (
        <div className='dm-sidebar'>
            <div className='dm-sidebar__header'>
                <span className='dm-sidebar__header-text'>{'私信'}</span>
            </div>
            <button
                id='dm-sidebar-search-btn'
                className='dm-sidebar__search-trigger'
                onClick={handleOpenSearch}
                aria-label='查找成员'
                type='button'
            >
                <i className='icon icon-magnify dm-sidebar__search-icon'/>
                <span className='dm-sidebar__search-placeholder'>{'查找成员'}</span>
            </button>
            <div className='dm-sidebar__list'>
                <div className='dm-sidebar__section'>
                    <button
                        type='button'
                        className='dm-sidebar__section-header'
                        onClick={() => setIsRecentOpen(!isRecentOpen)}
                        aria-expanded={isRecentOpen}
                    >
                        <i className={`icon ${isRecentOpen ? 'icon-chevron-down' : 'icon-chevron-right'} dm-sidebar__section-icon`}/>
                        <span className='dm-sidebar__section-title'>{'最近聊天'}</span>
                    </button>
                    {isRecentOpen && displayedRecentUsers.map(({user, dmInfo}) => (
                        <DmContactItem
                            key={`recent-${user.id}`}
                            user={user}
                            status={statuses[user.id]}
                            unreadCount={dmInfo?.unread ?? 0}
                            isActive={(activeUsername && user.username.toLowerCase() === activeUsername) || user.id === activeUserId}
                            nameDisplaySetting={nameDisplaySetting}
                            onClick={handleClick}
                        />
                    ))}
                </div>

                <div className='dm-sidebar__section'>
                    <button
                        type='button'
                        className='dm-sidebar__section-header'
                        onClick={() => setIsAllMembersOpen(!isAllMembersOpen)}
                        aria-expanded={isAllMembersOpen}
                    >
                        <i className={`icon ${isAllMembersOpen ? 'icon-chevron-down' : 'icon-chevron-right'} dm-sidebar__section-icon`}/>
                        <span className='dm-sidebar__section-title'>{'全部成员'}</span>
                    </button>
                    {isAllMembersOpen && allMembers.map(({user, dmInfo}) => (
                        <DmContactItem
                            key={`all-${user.id}`}
                            user={user}
                            status={statuses[user.id]}
                            unreadCount={dmInfo?.unread ?? 0}
                            isActive={(activeUsername && user.username.toLowerCase() === activeUsername) || user.id === activeUserId}
                            nameDisplaySetting={nameDisplaySetting}
                            onClick={handleClick}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
