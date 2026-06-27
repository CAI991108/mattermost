// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useCallback, useMemo, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useRouteMatch} from 'react-router-dom';

import {getMissingProfilesByIds, getMissingProfilesByUsernames} from 'mattermost-redux/actions/users';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getUserByUsername, getUsers, getUserStatuses} from 'mattermost-redux/selectors/entities/users';

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

type RecentDmUser = {
    userId: string;
    dmInfo: DmUnreadInfo;
};

type DisplayedRecentUser = {
    user: UserProfile;
    dmInfo: DmUnreadInfo | null;
};

function getRecentDmUsers(dmUnreadByUserId: Record<string, DmUnreadInfo>): RecentDmUser[] {
    return Object.entries(dmUnreadByUserId)
        .filter(([, dmInfo]) => dmInfo.hasHistory)
        .sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt)
        .slice(0, 20)
        .map(([userId, dmInfo]) => ({userId, dmInfo}));
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

    const profilesById = useSelector(getUsers);
    const activeUserByUsername = useSelector((state: GlobalState) => activeUsername ? getUserByUsername(state, activeUsername) : undefined);
    const statuses = useSelector(getUserStatuses);
    const dmUnreadByUserId = useSelector(getDmUnreadByUserId);
    const nameDisplaySetting = useSelector(getTeammateNameDisplaySetting);

    const [isRecentOpen, setIsRecentOpen] = useState(true);

    const recentDmUsers = useMemo(() => getRecentDmUsers(dmUnreadByUserId), [dmUnreadByUserId]);

    const activeProfile = activeUserId ? profilesById[activeUserId] : activeUserByUsername;
    const activeProfileId = activeProfile?.id ?? activeUserId;

    const profileIdsToLoad = useMemo(() => {
        const userIds = new Set<string>();
        recentDmUsers.forEach(({userId}) => userIds.add(userId));
        if (activeProfileId) {
            userIds.add(activeProfileId);
        }
        return Array.from(userIds);
    }, [activeProfileId, recentDmUsers]);

    useEffect(() => {
        if (activeUsername && !activeUserByUsername) {
            dispatch(getMissingProfilesByUsernames([activeUsername]) as any);
        }
    }, [activeUsername, activeUserByUsername, dispatch]);

    useEffect(() => {
        if (profileIdsToLoad.length > 0) {
            dispatch(getMissingProfilesByIds(profileIdsToLoad) as any);
        }
    }, [dispatch, profileIdsToLoad]);

    const displayedRecentUsers = useMemo(() => {
        const recentUsers = recentDmUsers.reduce<DisplayedRecentUser[]>((users, {userId, dmInfo}) => {
            const user = profilesById[userId];
            if (user && user.delete_at === 0) {
                users.push({user, dmInfo});
            }
            return users;
        }, []);

        if (!activeProfile || activeProfile.delete_at !== 0 || !activeProfileId) {
            return recentUsers;
        }

        if (recentUsers.some(({user}) => user.id === activeProfileId)) {
            return recentUsers;
        }

        return [{user: activeProfile, dmInfo: dmUnreadByUserId[activeProfileId] ?? null}, ...recentUsers];
    }, [activeProfile, activeProfileId, dmUnreadByUserId, profilesById, recentDmUsers]);

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

            </div>
        </div>
    );
}
