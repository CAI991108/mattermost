// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createSelector} from 'mattermost-redux/selectors/create_selector';
import {isChannelMuted} from 'mattermost-redux/utils/channel_utils';

import type {GlobalState} from 'types/store';

export type ChatListEntryKind = 'channel' | 'direct' | 'group';

export type ChatListEntry = {
    id: string;
    kind: ChatListEntryKind;
    displayName: string;
    path: string;
    activityAt: number;
    unreadMentions: number;
    muted: boolean;
};

const CHANNEL_TYPES = ['O', 'P'];
const DIRECT_TYPE = 'D';
const GROUP_TYPE = 'G';

function kindOf(channelType: string): ChatListEntryKind | null {
    if (CHANNEL_TYPES.includes(channelType)) {
        return 'channel';
    }

    if (channelType === DIRECT_TYPE) {
        return 'direct';
    }

    if (channelType === GROUP_TYPE) {
        return 'group';
    }

    return null;
}

function directUsername(channelName: string, currentUserId: string, profiles: Record<string, {username: string}>) {
    const otherId = channelName.split('__').find((id) => id && id !== currentUserId);

    return otherId ? profiles[otherId]?.username ?? '' : '';
}

/**
 * The chat list is one list of conversations, so it cannot inherit either existing order: the
 * direct message list skips anything that is not a direct message, and the channel order is the
 * user's manual category order. Activity is the later of the last post and the channel's own
 * creation, the tie break is the display name, and nothing is hidden - a muted conversation keeps
 * its place and only carries a marker (KTD2, R7).
 */
export const getChatListEntries = createSelector(
    'getChatListEntries',
    (state: GlobalState) => state.entities.channels.channels,
    (state: GlobalState) => state.entities.channels.myMembers,
    (state: GlobalState) => state.entities.users.profiles,
    (state: GlobalState) => state.entities.users.currentUserId,
    (state: GlobalState) => state.entities.teams.currentTeamId,
    (state: GlobalState) => state.entities.teams.teams,
    (channels, myMembers, profiles, currentUserId, currentTeamId, teams) => {
        const teamName = teams[currentTeamId]?.name ?? '';
        const entries: ChatListEntry[] = [];

        Object.keys(myMembers).forEach((channelId) => {
            const channel = channels[channelId];
            const membership = myMembers[channelId];
            if (!channel || !membership || channel.delete_at > 0) {
                return;
            }

            const kind = kindOf(channel.type);
            if (!kind) {
                return;
            }

            if (kind === 'channel' && channel.team_id !== currentTeamId) {
                return;
            }

            if (!teamName) {
                return;
            }

            let displayName = channel.display_name || channel.name;
            let path = `/${teamName}/channels/${channel.name}`;

            if (kind === 'direct') {
                displayName = directUsername(channel.name, currentUserId, profiles);
                path = `/${teamName}/messages/@${displayName}`;
            } else if (kind === 'group') {
                path = `/${teamName}/messages/${channel.name}`;
            }

            entries.push({
                id: channel.id,
                kind,
                displayName,
                path,
                activityAt: Math.max(channel.last_post_at || 0, channel.create_at || 0),
                unreadMentions: membership.mention_count || 0,
                muted: isChannelMuted(membership),
            });
        });

        return entries.sort((a, b) => {
            if (a.activityAt !== b.activityAt) {
                return b.activityAt - a.activityAt;
            }

            const byName = a.displayName.localeCompare(b.displayName);
            if (byName !== 0) {
                return byName;
            }

            return a.id.localeCompare(b.id);
        });
    },
);
