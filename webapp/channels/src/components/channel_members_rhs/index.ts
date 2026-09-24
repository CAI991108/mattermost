// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import type {AnyAction, Dispatch} from 'redux';

import type {Channel, ChannelMembership} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';
import type {RelationOneToOne} from '@mattermost/types/utilities';

import {loadMyChannelMemberAndRole} from 'mattermost-redux/actions/channels';
import {fetchRemoteClusterInfo} from 'mattermost-redux/actions/shared_channels';
import {getProfilesInTeam} from 'mattermost-redux/actions/users';
import {Permissions} from 'mattermost-redux/constants';
import {createSelector} from 'mattermost-redux/selectors/create_selector';
import {
    getAllChannels,
    getCurrentChannel,
    getCurrentChannelStats,
    getChannelMessageCount,
    getMembersInCurrentChannel,
    getMyCurrentChannelMembership,
    isCurrentChannelArchived,
} from 'mattermost-redux/selectors/entities/channels';
import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/common';

import {getTeammateNameDisplaySetting, isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {haveIChannelPermission} from 'mattermost-redux/selectors/entities/roles';
import {getRemoteDisplayName} from 'mattermost-redux/selectors/entities/shared_channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {
    getActiveProfilesInCurrentChannelWithoutSorting,
    getCurrentUserId,
    getProfilesInCurrentTeam,
    getUserStatuses,
    searchActiveProfilesInCurrentChannel,
    searchProfilesInCurrentTeam,
} from 'mattermost-redux/selectors/entities/users';
import {calculateUnreadCount} from 'mattermost-redux/utils/channel_utils';

import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {openDirectChannelToUserId} from 'actions/channel_actions';
import {loadProfilesAndReloadChannelMembers, searchProfilesAndChannelMembers} from 'actions/user_actions';
import {openModal} from 'actions/views/modals';
import {closeRightHandSide, goBack, setEditChannelMembers} from 'actions/views/rhs';
import {setChannelMembersRhsSearchTerm} from 'actions/views/search';
import {getIsEditingMembers, getPreviousRhsState} from 'selectors/rhs';

import {Constants, RHSStates} from 'utils/constants';
import {getUserIdFromChannelId} from 'utils/utils';

import type {GlobalState} from 'types/store';

import ChannelMembersRHS from './channel_members_rhs';
import type {Props} from './channel_members_rhs';
import type {ChannelMember} from './member_list';

const buildProfileList = (
    profilesInCurrentChannel: UserProfile[],
    userStatuses: RelationOneToOne<UserProfile, string>,
    teammateNameDisplaySetting: string,
    membersInCurrentChannel: Record<string, ChannelMembership>,
    state: GlobalState,
) => {
    const channelMembers: ChannelMember[] = [];
    profilesInCurrentChannel.forEach((profile) => {
        if (!membersInCurrentChannel[profile.id]) {
            return;
        }

        const remoteDisplayName = profile.remote_id ? getRemoteDisplayName(state, profile.remote_id) || undefined : undefined;

        channelMembers.push({
            user: profile,
            membership: membersInCurrentChannel[profile.id],
            status: userStatuses[profile.id],
            displayName: displayUsername(profile, teammateNameDisplaySetting),
            remoteDisplayName,
        });
    });

    channelMembers.sort((a, b) => {
        if (a.membership?.scheme_admin === b.membership?.scheme_admin) {
            return a.displayName.localeCompare(b.displayName);
        }

        if (a.membership?.scheme_admin === true) {
            return -1;
        }
        return 1;
    });

    return channelMembers;
};

// LZX: 构建团队成员列表（DM 场景），无 membership 过滤，按字母排序
const buildTeamProfileList = (
    profiles: UserProfile[],
    userStatuses: RelationOneToOne<UserProfile, string>,
    teammateNameDisplaySetting: string,
): ChannelMember[] => {
    return profiles.
        map((profile) => ({
            user: profile,
            membership: undefined,
            status: userStatuses[profile.id],
            displayName: displayUsername(profile, teammateNameDisplaySetting),
        })).
        sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const getProfiles = createSelector(
    'getProfiles',
    getActiveProfilesInCurrentChannelWithoutSorting,
    getUserStatuses,
    getTeammateNameDisplaySetting,
    getMembersInCurrentChannel,
    (state: GlobalState) => state,
    buildProfileList,
);

const searchProfiles = createSelector(
    'searchProfiles',
    (state: GlobalState, search: string) => searchActiveProfilesInCurrentChannel(state, search, false),
    getUserStatuses,
    getTeammateNameDisplaySetting,
    getMembersInCurrentChannel,
    (state: GlobalState) => state,
    buildProfileList,
);

// LZX: DM 场景 — 全团队成员 selector
const getTeamProfiles = createSelector(
    'getTeamProfiles',
    getProfilesInCurrentTeam,
    getUserStatuses,
    getTeammateNameDisplaySetting,
    buildTeamProfileList,
);

const searchTeamProfiles = createSelector(
    'searchTeamProfiles',
    (state: GlobalState, search: string) => searchProfilesInCurrentTeam(state, search),
    getUserStatuses,
    getTeammateNameDisplaySetting,
    buildTeamProfileList,
);

function mapStateToProps(state: GlobalState) {
    const channel = getCurrentChannel(state);
    const currentTeam = getCurrentTeam(state);
    const currentUser = getMyCurrentChannelMembership(state);
    const {member_count: membersCount} = getCurrentChannelStats(state) || {member_count: 0};

    if (!channel) {
        return {
            channel: {} as Channel,
            currentUserIsChannelAdmin: false,
            channelMembers: [],
            channelAdmins: [],
            searchTerms: '',
            membersCount,
            canManageMembers: false,
            canGoBack: false,
            teamId: '',
        } as unknown as Props;
    }

    // LZX: DM 场景，使用全团队成员
    const isDmChannel = channel.type === Constants.DM_CHANNEL;
    const isGmChannel = channel.type === Constants.GM_CHANNEL;

    const isArchived = isCurrentChannelArchived(state);
    const isPrivate = channel.type === Constants.PRIVATE_CHANNEL;
    const canManageMembers = haveIChannelPermission(
        state,
        currentTeam?.id,
        channel.id,
        isPrivate ? Permissions.MANAGE_PRIVATE_CHANNEL_MEMBERS : Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS,
    ) && !isArchived;

    const searchTerms = state.views.search.channelMembersRhsSearch || '';

    let channelMembers: ChannelMember[] = [];
    if (isDmChannel) {
        const allChannels = getAllChannels(state);
        const myMemberships = getMyChannelMemberships(state);
        const crtEnabled = isCollapsedThreadsEnabled(state);

        const currentUserId = getCurrentUserId(state);
        const dmUnreadByUserId: Record<string, {unread: number; lastPostAt: number}> = {};

        for (const dmChannel of Object.values(allChannels)) {
            if (dmChannel.type !== Constants.DM_CHANNEL) {
                continue;
            }

            const membership = myMemberships[dmChannel.id];
            if (!membership) {
                continue;
            }

            const otherUserId = getUserIdFromChannelId(dmChannel.name, currentUserId);
            const messageCount = getChannelMessageCount(state, dmChannel.id);
            const unread = messageCount ? calculateUnreadCount(messageCount, membership, crtEnabled).messages : 0;
            dmUnreadByUserId[otherUserId] = {
                unread,
                lastPostAt: dmChannel.last_post_at || 0,
            };
        }

        // DM 场景：显示全团队成员，并补充每个成员对应私信的未读数据
        channelMembers = (searchTerms === '' ? getTeamProfiles(state) : searchTeamProfiles(state, searchTerms.trim())).
            map((member) => {
                const dmUnread = dmUnreadByUserId[member.user.id];
                return {
                    ...member,
                    dmUnreadCount: dmUnread?.unread || 0,
                    dmLastPostAt: dmUnread?.lastPostAt || 0,
                };
            }).
            sort((a, b) => {
                const aHasUnread = (a.dmUnreadCount || 0) > 0;
                const bHasUnread = (b.dmUnreadCount || 0) > 0;

                if (aHasUnread && !bHasUnread) {
                    return -1;
                }
                if (!aHasUnread && bHasUnread) {
                    return 1;
                }
                if (aHasUnread && bHasUnread) {
                    return (b.dmLastPostAt || 0) - (a.dmLastPostAt || 0);
                }

                return 0;
            });
    } else if (searchTerms === '') {
        channelMembers = getProfiles(state);
    } else {
        channelMembers = searchProfiles(state, searchTerms.trim());
    }

    const prevRhsState = getPreviousRhsState(state);
    const hasInfoPrevState = prevRhsState === RHSStates.CHANNEL_INFO ||
        prevRhsState === RHSStates.CHANNEL_FILES ||
        prevRhsState === RHSStates.PIN;

    const canGoBack = Boolean(hasInfoPrevState);
    const editing = getIsEditingMembers(state);

    const currentUserIsChannelAdmin = currentUser && currentUser.scheme_admin;

    return {
        channel,
        currentUserIsChannelAdmin,
        // DM 场景显示全团队成员数量；管理按钮由 canManageMembers 单独控制
        membersCount: isDmChannel ? channelMembers.length : membersCount,
        searchTerms,
        teamId: currentTeam?.id || '',
        canGoBack,
        canManageMembers: isDmChannel || isGmChannel ? false : canManageMembers,
        channelMembers,
        editing,
    } as Props;
}

function mapDispatchToProps(dispatch: Dispatch<AnyAction>) {
    return {
        actions: bindActionCreators({
            openModal,
            openDirectChannelToUserId,
            closeRightHandSide,
            goBack,
            setChannelMembersRhsSearchTerm,
            loadProfilesAndReloadChannelMembers,
            loadMyChannelMemberAndRole,
            setEditChannelMembers,
            searchProfilesAndChannelMembers,
            fetchRemoteClusterInfo,
            getProfilesInTeam,
        }, dispatch),
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(ChannelMembersRHS);
