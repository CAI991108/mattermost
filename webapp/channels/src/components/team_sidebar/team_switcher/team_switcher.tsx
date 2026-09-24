// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';

import TeamButton from 'components/team_sidebar/components/team_button';

import {filterAndSortTeamsByDisplayName} from 'utils/team_utils';
import * as Utils from 'utils/utils';

import type {PropsFromRedux} from './index';

import './team_switcher.scss';

export type Props = PropsFromRedux;

/**
 * Team switcher for the narrow shell (R13, KTD7).
 *
 * The team sidebar is collapsed below the narrow breakpoint, so the same team button
 * list is rendered into the left sidebar header instead. It replaces nothing at wider
 * windows: the left sidebar header that mounts it only exists in the narrow shell.
 */
export default function TeamSwitcher(props: Props) {
    const handleSwitch = useCallback((url: string) => {
        props.actions.switchTeam(url);
    }, [props.actions]);

    const teams = filterAndSortTeamsByDisplayName(props.myTeams, props.locale, props.userTeamsOrderPreference);

    // Nothing to switch to: an account with a single team keeps the plain team name
    // the header already renders.
    if (teams.length < 2) {
        return null;
    }

    return (
        <div
            className='teamSwitcher'
            data-testid='teamSwitcher'
        >
            {teams.map((team, index) => (
                <TeamButton
                    key={team.id}
                    url={`/${team.name}`}
                    displayName={team.display_name}
                    tip={team.display_name}
                    active={team.id === props.currentTeamId}
                    order={index + 1}
                    unread={props.unreadTeamsSet.has(team.id)}
                    mentions={props.mentionsInTeamMap.get(team.id) ?? 0}
                    hasUrgent={props.teamHasUrgentMap.has(team.id)}
                    teamIconUrl={Utils.imageURLForTeam(team)}
                    switchTeam={handleSwitch}
                    teamId={team.id}
                />
            ))}
        </div>
    );
}
