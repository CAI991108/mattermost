// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';

import {getTeamsUnreadStatuses} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import type {GlobalState} from 'types/store';

import NotificationsButton from './notifications_button';

const mapStateToProps = (state: GlobalState) => {
    const team = getCurrentTeam(state);
    const [, mentionsInTeamMap] = getTeamsUnreadStatuses(state);

    return {
        teamName: team?.name ?? '',
        unreadMentionCount: (team && mentionsInTeamMap.get(team.id)) || 0,
    };
};

export default connect(mapStateToProps)(NotificationsButton);
