// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSelector} from 'mattermost-redux/selectors/create_selector';
import {getAllChannels, getChannelMessageCount} from 'mattermost-redux/selectors/entities/channels';
import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/common';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {calculateUnreadCount} from 'mattermost-redux/utils/channel_utils';

import {Constants} from 'utils/constants';
import {getUserIdFromChannelId} from 'utils/utils';

import type {GlobalState} from 'types/store';

export type DmUnreadInfo = {
    unread: number;
    lastPostAt: number;
    hasHistory: boolean;
};

/**
 * Returns a map of userId -> DmUnreadInfo for all DM channels the current user is a member of.
 * Shared logic for TeamSidebar DM badge and DirectMessagesSidebar contact list.
 */
export const getDmUnreadByUserId = createSelector(
    'getDmUnreadByUserId',
    getAllChannels,
    getMyChannelMemberships,
    getCurrentUserId,
    (state: GlobalState) => isCollapsedThreadsEnabled(state),
    (state: GlobalState) => state,
    (allChannels, myMemberships, currentUserId, crtEnabled, state) => {
        const result: Record<string, DmUnreadInfo> = {};

        for (const dmChannel of Object.values(allChannels)) {
            if (dmChannel.type !== Constants.DM_CHANNEL) {
                continue;
            }
            const membership = myMemberships[dmChannel.id];
            if (!membership) {
                continue;
            }

            const otherUserId = getUserIdFromChannelId(dmChannel.name, currentUserId);
            if (!otherUserId) {
                continue;
            }

            const messageCount = getChannelMessageCount(state, dmChannel.id);
            const unread = messageCount
                ? calculateUnreadCount(messageCount, membership, crtEnabled).messages
                : Math.max(0, (dmChannel.total_msg_count || 0) - (membership.msg_count || 0));

            result[otherUserId] = {
                unread,
                lastPostAt: dmChannel.last_post_at || 0,
                hasHistory: (dmChannel.last_post_at || 0) > 0,
            };
        }

        return result;
    },
);

/**
 * Returns true if any DM channel has unread messages.
 * Used by TeamSidebar DM button to show blue dot.
 */
export const getHasUnreadDMs = createSelector(
    'getHasUnreadDMs',
    getDmUnreadByUserId,
    (dmUnreadByUserId) => {
        return Object.values(dmUnreadByUserId).some((info) => info.unread > 0);
    },
);

/**
 * Returns total unread messages across all DM channels.
 * Used by TeamSidebar DM button to show a numeric badge.
 */
export const getTotalUnreadDMs = createSelector(
    'getTotalUnreadDMs',
    getDmUnreadByUserId,
    (dmUnreadByUserId) => {
        return Object.values(dmUnreadByUserId).reduce((total, info) => total + info.unread, 0);
    },
);

/**
 * Returns the userId of the best default DM target:
 * 1. Most recent DM with unread messages
 * 2. Most recent DM with any history
 * 3. currentUserId (self DM)
 */
export const getDmDefaultTargetUserId = createSelector(
    'getDmDefaultTargetUserId',
    getDmUnreadByUserId,
    getCurrentUserId,
    (dmUnreadByUserId, currentUserId) => {
        const entries = Object.entries(dmUnreadByUserId);

        // 1. Most recent unread DM
        const unreadEntries = entries
            .filter(([, info]) => info.unread > 0)
            .sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt);
        if (unreadEntries.length > 0) {
            return unreadEntries[0][0];
        }

        // 2. Most recent DM with history
        const historyEntries = entries
            .filter(([, info]) => info.hasHistory)
            .sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt);
        if (historyEntries.length > 0) {
            return historyEntries[0][0];
        }

        // 3. Self DM
        return currentUserId;
    },
);
