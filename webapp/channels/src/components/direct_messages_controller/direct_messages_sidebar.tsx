// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useCallback, useMemo, useRef, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
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

type DmUserEntry = {
    userId: string;
    dmInfo: DmUnreadInfo;
};

type DisplayedDmUser = {
    user: UserProfile;
    dmInfo: DmUnreadInfo | null;
};

function getUnreadDmUsers(dmUnreadByUserId: Record<string, DmUnreadInfo>, lastUnreadDmUserId: string | null): DmUserEntry[] {
    return Object.entries(dmUnreadByUserId)
        .filter(([userId, dmInfo]) => dmInfo.hasHistory && (dmInfo.unread > 0 || userId === lastUnreadDmUserId))
        .sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt)
        .map(([userId, dmInfo]) => ({userId, dmInfo}));
}

function getRecentDmUsers(dmUnreadByUserId: Record<string, DmUnreadInfo>, lastUnreadDmUserId: string | null): DmUserEntry[] {
    return Object.entries(dmUnreadByUserId)
        .filter(([userId, dmInfo]) => dmInfo.hasHistory && dmInfo.unread === 0 && userId !== lastUnreadDmUserId)
        .sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt)
        .slice(0, 20)
        .map(([userId, dmInfo]) => ({userId, dmInfo}));
}

export default function DirectMessagesSidebar() {
    const dispatch = useDispatch();
    const intl = useIntl();
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
    const [lastUnreadDmUserId, setLastUnreadDmUserId] = useState<string | null>(null);
    const previousActiveProfileId = useRef<string | null>(null);
    const pendingLastUnreadDmUserId = useRef<string | null>(null);

    const activeProfile = activeUserId ? profilesById[activeUserId] : activeUserByUsername;
    const activeProfileId = activeProfile?.id ?? activeUserId;

    useEffect(() => {
        if (activeProfileId === previousActiveProfileId.current) {
            return;
        }

        previousActiveProfileId.current = activeProfileId ?? null;

        if (!activeProfileId) {
            pendingLastUnreadDmUserId.current = null;
            setLastUnreadDmUserId(null);
            return;
        }

        const activeDmInfo = dmUnreadByUserId[activeProfileId];
        const hadUnreadOnNavigation = pendingLastUnreadDmUserId.current === activeProfileId;
        const nextLastUnreadDmUserId = activeDmInfo?.hasHistory && (activeDmInfo.unread > 0 || hadUnreadOnNavigation) ? activeProfileId : null;
        pendingLastUnreadDmUserId.current = null;
        setLastUnreadDmUserId(nextLastUnreadDmUserId);
    }, [activeProfileId, dmUnreadByUserId]);

    const unreadDmUsers = useMemo(() => getUnreadDmUsers(dmUnreadByUserId, lastUnreadDmUserId), [dmUnreadByUserId, lastUnreadDmUserId]);
    const recentDmUsers = useMemo(() => getRecentDmUsers(dmUnreadByUserId, lastUnreadDmUserId), [dmUnreadByUserId, lastUnreadDmUserId]);

    const profileIdsToLoad = useMemo(() => {
        const userIds = new Set<string>();
        unreadDmUsers.forEach(({userId}) => userIds.add(userId));
        recentDmUsers.forEach(({userId}) => userIds.add(userId));
        if (activeProfileId) {
            userIds.add(activeProfileId);
        }
        return Array.from(userIds);
    }, [activeProfileId, recentDmUsers, unreadDmUsers]);

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

    const displayedUnreadUsers = useMemo(() => {
        return unreadDmUsers.reduce<DisplayedDmUser[]>((users, {userId, dmInfo}) => {
            const user = profilesById[userId];
            if (user && user.delete_at === 0) {
                users.push({user, dmInfo});
            }
            return users;
        }, []);
    }, [profilesById, unreadDmUsers]);

    const displayedRecentUsers = useMemo(() => {
        const recentUsers = recentDmUsers.reduce<DisplayedDmUser[]>((users, {userId, dmInfo}) => {
            const user = profilesById[userId];
            if (user && user.delete_at === 0) {
                users.push({user, dmInfo});
            }
            return users;
        }, []);

        if (!activeProfile || activeProfile.delete_at !== 0 || !activeProfileId) {
            return recentUsers;
        }

        const activeUserDisplayed = displayedUnreadUsers.some(({user}) => user.id === activeProfileId) || recentUsers.some(({user}) => user.id === activeProfileId);
        if (activeUserDisplayed) {
            return recentUsers;
        }

        return [{user: activeProfile, dmInfo: dmUnreadByUserId[activeProfileId] ?? null}, ...recentUsers];
    }, [activeProfile, activeProfileId, displayedUnreadUsers, dmUnreadByUserId, profilesById, recentDmUsers]);

    const handleClick = (username: string) => {
        const targetUser = Object.values(profilesById).find((user) => user.username === username);
        const targetUserId = targetUser?.id;
        const targetDmInfo = targetUserId ? dmUnreadByUserId[targetUserId] : null;
        const nextLastUnreadDmUserId = targetUserId && targetDmInfo?.hasHistory && targetDmInfo.unread > 0 ? targetUserId : null;
        pendingLastUnreadDmUserId.current = nextLastUnreadDmUserId;
        setLastUnreadDmUserId(nextLastUnreadDmUserId);
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
                <span className='dm-sidebar__header-text'>
                    <FormattedMessage
                        id='direct_messages.sidebar.title'
                        defaultMessage='Direct Messages'
                    />
                </span>
            </div>
            <button
                id='dm-sidebar-search-btn'
                className='dm-sidebar__search-trigger'
                onClick={handleOpenSearch}
                aria-label={intl.formatMessage({id: 'direct_messages.sidebar.find_members', defaultMessage: 'Find members'})}
                type='button'
            >
                <i className='icon icon-magnify dm-sidebar__search-icon'/>
                <span className='dm-sidebar__search-placeholder'>
                    <FormattedMessage
                        id='direct_messages.sidebar.find_members'
                        defaultMessage='Find members'
                    />
                </span>
            </button>
            <div className='dm-sidebar__list'>
                {displayedUnreadUsers.length > 0 && (
                    <div className='dm-sidebar__section'>
                        <div className='dm-sidebar__section-header dm-sidebar__section-header--fixed'>
                            <span className='dm-sidebar__section-title'>
                                <FormattedMessage
                                    id='direct_messages.sidebar.unreads'
                                    defaultMessage='Unreads'
                                />
                            </span>
                        </div>
                        {displayedUnreadUsers.map(({user, dmInfo}) => (
                            <DmContactItem
                                key={`unread-${user.id}`}
                                user={user}
                                status={statuses[user.id]}
                                unreadCount={dmInfo?.unread ?? 0}
                                isActive={(activeUsername && user.username.toLowerCase() === activeUsername) || user.id === activeUserId}
                                nameDisplaySetting={nameDisplaySetting}
                                onClick={handleClick}
                            />
                        ))}
                    </div>
                )}
                <div className='dm-sidebar__section'>
                    <button
                        type='button'
                        className='dm-sidebar__section-header'
                        onClick={() => setIsRecentOpen(!isRecentOpen)}
                        aria-expanded={isRecentOpen}
                    >
                        <i className={`icon ${isRecentOpen ? 'icon-chevron-down' : 'icon-chevron-right'} dm-sidebar__section-icon`}/>
                        <span className='dm-sidebar__section-title'>
                            <FormattedMessage
                                id='direct_messages.sidebar.recent_chats'
                                defaultMessage='Recent chats'
                            />
                        </span>
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
