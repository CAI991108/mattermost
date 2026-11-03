// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import ChannelListView from './channel_list_view';

jest.mock('components/team_sidebar/team_switcher', () => () => <div data-testid='teamSwitcher'/>);
jest.mock('components/browse_channels', () => () => <div data-testid='browseChannelsModal'/>);
jest.mock('actions/views/modals', () => ({
    openModal: jest.fn(() => ({type: 'MOCK_OPEN_MODAL'})),
}));

describe('components/bottom_navigation/entry_views/ChannelListView', () => {
    const currentUserId = 'user1';
    const team = TestHelper.getTeamMock({id: 'team_id', name: 'cai'});

    const alpha = TestHelper.getChannelMock({id: 'channel-alpha', type: 'O', name: 'alpha', display_name: 'Alpha', team_id: team.id, last_post_at: 100});
    const dm = TestHelper.getChannelMock({id: 'channel-dm', type: 'D', name: `${currentUserId}__user2`, team_id: '', last_post_at: 300});

    function buildState(channels = [alpha, dm]) {
        const channelMap: Record<string, typeof alpha> = {};
        const members: Record<string, ReturnType<typeof TestHelper.getChannelMembershipMock>> = {};

        channels.forEach((channel) => {
            channelMap[channel.id] = channel;
            members[channel.id] = TestHelper.getChannelMembershipMock({channel_id: channel.id, user_id: currentUserId});
        });

        return {
            entities: {
                channels: {channels: channelMap, myMembers: members},
                users: {
                    currentUserId,
                    profiles: {
                        [currentUserId]: TestHelper.getUserMock({id: currentUserId, username: 'me'}),
                        user2: TestHelper.getUserMock({id: 'user2', username: 'alice'}),
                    },
                },
                teams: {currentTeamId: team.id, teams: {[team.id]: team}},
            },
        };
    }

    test('lists every conversation in one column, newest activity first', () => {
        renderWithContext(<ChannelListView/>, buildState());

        expect(screen.getByTestId('chatListView')).toBeInTheDocument();
        expect(screen.getByTestId('teamSwitcher')).toBeInTheDocument();

        const rows = screen.getAllByTestId(/^chatListRow-/);
        expect(rows.map((row) => row.textContent)).toEqual(['alice', 'Alpha']);
    });

    test('narrows the same list with the filter instead of switching pages', async () => {
        renderWithContext(<ChannelListView/>, buildState());

        await userEvent.click(screen.getByTestId('chatFilter-channels'));

        expect(screen.getAllByTestId(/^chatListRow-/)).toHaveLength(1);
        expect(screen.getByText('Alpha')).toBeInTheDocument();
        expect(screen.queryByText('alice')).not.toBeInTheDocument();
        expect(screen.getByTestId('chatFilter-channels')).toHaveAttribute('aria-selected', 'true');
    });

    test('shows the empty state when the filter has nothing to show', async () => {
        renderWithContext(<ChannelListView/>, buildState([alpha]));

        await userEvent.click(screen.getByTestId('chatFilter-direct'));

        expect(screen.getByTestId('chatListEmpty')).toBeInTheDocument();
        expect(screen.queryAllByTestId(/^chatListRow-/)).toHaveLength(0);
    });

    test('keeps a way to join more channels at the end of the list', async () => {
        const {openModal} = jest.requireMock('actions/views/modals');

        renderWithContext(<ChannelListView/>, buildState());

        await userEvent.click(screen.getByTestId('chatListBrowseChannels'));

        expect(openModal).toHaveBeenCalledWith(expect.objectContaining({modalId: 'more_channels'}));
    });
});
