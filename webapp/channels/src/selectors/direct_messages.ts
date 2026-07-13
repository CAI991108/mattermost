// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSelector} from 'mattermost-redux/selectors/create_selector';
import {getAllChannels, getChannelMessageCount} from 'mattermost-redux/selectors/entities/channels';
import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/common';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {calculateUnreadCount, isChannelMuted} from 'mattermost-redux/utils/channel_utils';

import {Constants} from 'utils/constants';
import {getUserIdFromChannelId} from 'utils/utils';

import type {GlobalState} from 'types/store';

export type DmUnreadInfo = {
    unread: number;
    lastPostAt: number;
    hasHistory: boolean;
    channelId: string;
    isMuted: boolean;
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
            let unread = 0;
            if (messageCount) {
                unread = calculateUnreadCount(messageCount, membership, crtEnabled).messages;
            } else if ((dmChannel.last_post_at || 0) > (membership.last_viewed_at || 0)) {
                unread = 1;
            }

            // calculateUnreadCount always returns messages=0 for muted channels because the
            // reducer keeps msg_count in sync with total_msg_count for muted channels.
            // Fall back to last_post_at > last_viewed_at (same approach as getMutedChannelIdsWithMessages
            // in channel_sidebar.ts) so muted DMs with new messages still show up in the unread group.
            if (unread === 0 && isChannelMuted(membership)) {
                unread = (dmChannel.last_post_at || 0) > (membership.last_viewed_at || 0) ? 1 : 0;
            }

            result[otherUserId] = {
                unread,
                lastPostAt: dmChannel.last_post_at || 0,
                hasHistory: (dmChannel.last_post_at || 0) > 0,
                channelId: dmChannel.id,
                isMuted: isChannelMuted(membership),
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
 * Returns total unread messages across all non-muted DM channels.
 * Muted DMs are excluded so the TeamSidebar private-message button badge
 * is not incremented by messages from muted contacts.
 * Used by TeamSidebar DM button to show a numeric badge.
 */
export const getTotalUnreadDMs = createSelector(
    'getTotalUnreadDMs',
    getDmUnreadByUserId,
    (dmUnreadByUserId) => {
        return Object.values(dmUnreadByUserId).reduce((total, info) => {
            if (info.isMuted) {
                return total;
            }
            return total + info.unread;
        }, 0);
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
        const unreadEntries = entries.
            filter(([, info]) => info.unread > 0).
            sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt);
        if (unreadEntries.length > 0) {
            return unreadEntries[0][0];
        }

        // 2. Most recent DM with history
        const historyEntries = entries.
            filter(([, info]) => info.hasHistory).
            sort(([, a], [, b]) => b.lastPostAt - a.lastPostAt);
        if (historyEntries.length > 0) {
            return historyEntries[0][0];
        }

        // 3. Self DM
        return currentUserId;
    },
);
