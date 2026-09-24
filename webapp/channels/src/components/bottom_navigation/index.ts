// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import type {ConnectedProps} from 'react-redux';

import {getCurrentChannel, getTeamsUnreadStatuses} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import {getIsLhsOpen} from 'selectors/lhs';
import {getLastViewedChannelNameByTeamName, getLastViewedTypeByTeamName} from 'selectors/local_storage';
import {getIsMobileView} from 'selectors/views/browser';

import {PreviousViewedTypes} from 'utils/constants';

import type {GlobalState} from 'types/store';

import BottomNavigation from './bottom_navigation';

function mapStateToProps(state: GlobalState) {
    const team = getCurrentTeam(state);
    const teamName = team?.name ?? '';
    const channelName = getCurrentChannel(state)?.name ?? '';

    const lastViewedType = teamName ? getLastViewedTypeByTeamName(state, teamName) : '';
    const lastViewedChannelName = teamName ? getLastViewedChannelNameByTeamName(state, teamName) : '';

    let messagesPath = teamName ? `/${teamName}/channels/${channelName}` : '';
    if (teamName && lastViewedType === PreviousViewedTypes.THREADS) {
        messagesPath = `/${teamName}/threads`;
    } else if (teamName && lastViewedChannelName) {
        messagesPath = `/${teamName}/channels/${lastViewedChannelName}`;
    }

    const [, mentionsInTeamMap] = getTeamsUnreadStatuses(state);

    return {
        isMobileView: getIsMobileView(state),
        lhsOpen: getIsLhsOpen(state),
        teamName,
        channelName,
        messagesPath,
        unreadMentionCount: (team && mentionsInTeamMap.get(team.id)) || 0,
    };
}

const connector = connect(mapStateToProps);

export type PropsFromRedux = ConnectedProps<typeof connector>;

export default connector(BottomNavigation);
