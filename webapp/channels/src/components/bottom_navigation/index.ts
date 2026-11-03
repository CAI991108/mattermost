// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import type {ConnectedProps} from 'react-redux';

import {getTeamsUnreadStatuses} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {getIsLhsOpen} from 'selectors/lhs';
import {getIsMobileView} from 'selectors/views/browser';

import type {GlobalState} from 'types/store';

import BottomNavigation from './bottom_navigation';

function mapStateToProps(state: GlobalState) {
    const team = getCurrentTeam(state);
    const teamName = team?.name ?? '';

    const [, mentionsInTeamMap] = getTeamsUnreadStatuses(state);

    return {
        isMobileView: getIsMobileView(state),
        lhsOpen: getIsLhsOpen(state),
        teamName,
        currentUsername: getCurrentUser(state)?.username ?? '',
        unreadMentionCount: (team && mentionsInTeamMap.get(team.id)) || 0,
    };
}

const connector = connect(mapStateToProps);

export type PropsFromRedux = ConnectedProps<typeof connector>;

export default connector(BottomNavigation);
