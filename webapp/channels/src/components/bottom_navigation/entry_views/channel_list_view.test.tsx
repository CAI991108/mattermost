// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {fetchMyCategories} from 'mattermost-redux/actions/channel_categories';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import ChannelListView from './channel_list_view';

jest.mock('components/team_sidebar/team_switcher', () => () => <div data-testid='teamSwitcher'/>);
jest.mock('components/sidebar/channel_navigator', () => () => <div data-testid='channelNavigator'/>);
jest.mock('components/sidebar/sidebar_list', () => () => <div data-testid='sidebarList'/>);
jest.mock('mattermost-redux/actions/channel_categories', () => ({
    fetchMyCategories: jest.fn((teamId: string) => ({type: 'MOCK_FETCH_CATEGORIES', teamId})),
}));

describe('components/bottom_navigation/entry_views/ChannelListView', () => {
    const team = TestHelper.getTeamMock({id: 'team_id', name: 'cai'});

    const initialState = {
        entities: {
            teams: {
                currentTeamId: team.id,
                teams: {[team.id]: team},
            },
        },
    };

    test('carries the channel list the narrow shell shows in its one column', () => {
        renderWithContext(<ChannelListView/>, initialState);

        expect(screen.getByTestId('channelListView')).toBeInTheDocument();
        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getByTestId('teamSwitcher')).toBeInTheDocument();
        expect(screen.getByTestId('channelNavigator')).toBeInTheDocument();
        expect(screen.getAllByTestId('sidebarList')).toHaveLength(1);
    });

    test('loads the categories the list is grouped by, since the sidebar does not mount here', () => {
        renderWithContext(<ChannelListView/>, initialState);

        expect(fetchMyCategories).toHaveBeenCalledWith(team.id);
    });
});
