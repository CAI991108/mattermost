// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import TeamSwitcher from './index';

const historyMock = (global as unknown as {historyMock: {push: jest.Mock}}).historyMock;

describe('components/team_sidebar/team_switcher', () => {
    const currentTeam = TestHelper.getTeamMock({
        id: 'team-id-1',
        name: 'current-team',
        display_name: 'Current Team',
    });
    const otherTeam = TestHelper.getTeamMock({
        id: 'team-id-2',
        name: 'other-team',
        display_name: 'Other Team',
    });

    function stateForTeams(teams: Array<typeof currentTeam>, unreadInTeamId?: string) {
        const channels = unreadInTeamId ? {
            'channel-id-1': {
                id: 'channel-id-1',
                team_id: unreadInTeamId,
                type: 'O',
                delete_at: 0,
            },
        } : {};

        const myMembers = unreadInTeamId ? {
            'channel-id-1': {
                channel_id: 'channel-id-1',
                user_id: 'user-id',
                mention_count: 2,
                msg_count: 0,
                last_viewed_at: 0,
                notify_props: {mark_unread: 'all'},
            },
        } : {};

        const messageCounts = unreadInTeamId ? {
            'channel-id-1': {total: 5},
        } : {};

        return {
            entities: {
                general: {config: {}},
                preferences: {myPreferences: {}},
                threads: {counts: {}},
                teams: {
                    currentTeamId: currentTeam.id,
                    teams: Object.fromEntries(teams.map((team) => [team.id, team])),
                    myMembers: Object.fromEntries(teams.map((team) => [team.id, {
                        team_id: team.id,
                        user_id: 'user-id',
                    }])),
                },
                users: {
                    currentUserId: 'user-id',
                    profiles: {},
                },
                channels: {
                    channels,
                    myMembers,
                    messageCounts,
                },
            },
        };
    }

    it('should render one link per team and mark the current team as active', () => {
        renderWithContext(<TeamSwitcher/>, stateForTeams([currentTeam, otherTeam]));

        expect(screen.getByTestId('teamSwitcher')).toBeInTheDocument();
        expect(screen.getAllByRole('link')).toHaveLength(2);
        expect(screen.getByTestId(`team-container-${currentTeam.id}`)).toHaveClass('active');
        expect(screen.getByTestId(`team-container-${otherTeam.id}`)).not.toHaveClass('active');
    });

    it('should not render anything when the account belongs to a single team', () => {
        renderWithContext(<TeamSwitcher/>, stateForTeams([currentTeam]));

        expect(screen.queryByTestId('teamSwitcher')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('link')).toHaveLength(0);
    });

    it('should switch to the selected team', async () => {
        renderWithContext(<TeamSwitcher/>, stateForTeams([currentTeam, otherTeam]));

        await userEvent.click(screen.getByRole('link', {name: /other team team/i}));

        expect(historyMock.push).toHaveBeenCalledWith(`/${otherTeam.name}`);
    });

    it('should show the unread mention count of another team', () => {
        renderWithContext(<TeamSwitcher/>, stateForTeams([currentTeam, otherTeam], otherTeam.id));

        expect(screen.getByTestId(`team-badge-${otherTeam.id}`)).toHaveTextContent('2');
    });
});
