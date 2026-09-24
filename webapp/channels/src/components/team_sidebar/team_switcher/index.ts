// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import type {ConnectedProps} from 'react-redux';
import {bindActionCreators} from 'redux';
import type {Dispatch} from 'redux';

import {getTeamsUnreadStatuses} from 'mattermost-redux/selectors/entities/channels';
import {get} from 'mattermost-redux/selectors/entities/preferences';
import {
    getCurrentTeamId,
    getMyTeams,
} from 'mattermost-redux/selectors/entities/teams';

import {switchTeam} from 'actions/team_actions';
import {getCurrentLocale} from 'selectors/i18n';

import {Preferences} from 'utils/constants';

import type {GlobalState} from 'types/store';

import TeamSwitcher from './team_switcher';

function mapStateToProps(state: GlobalState) {
    const [unreadTeamsSet, mentionsInTeamMap, teamHasUrgentMap] = getTeamsUnreadStatuses(state);

    return {
        currentTeamId: getCurrentTeamId(state),
        myTeams: getMyTeams(state),
        locale: getCurrentLocale(state),
        userTeamsOrderPreference: get(state, Preferences.TEAMS_ORDER, '', ''),
        unreadTeamsSet,
        mentionsInTeamMap,
        teamHasUrgentMap,
    };
}

function mapDispatchToProps(dispatch: Dispatch) {
    return {
        actions: bindActionCreators({
            switchTeam,
        }, dispatch),
    };
}

const connector = connect(mapStateToProps, mapDispatchToProps);

export type PropsFromRedux = ConnectedProps<typeof connector>;

export default connector(TeamSwitcher);
