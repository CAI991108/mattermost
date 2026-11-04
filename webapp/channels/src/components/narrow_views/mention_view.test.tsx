// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {closeRightHandSide, showMentions} from 'actions/views/rhs';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import MentionView from './mention_view';

jest.mock('actions/views/rhs', () => ({
    closeRightHandSide: jest.fn(() => ({type: 'MOCK_CLOSE_RHS'})),
    showMentions: jest.fn(() => ({type: 'MOCK_SHOW_MENTIONS'})),
}));

jest.mock('components/search_results', () => (props: {isMentionSearch: boolean}) => (
    <div
        data-testid='searchResults'
        data-mentions={String(props.isMentionSearch)}
    />
));

jest.mock('components/common/hooks/use_search_results_actions', () => () => ({
    searchFilterType: 'all',
    getMorePostsForSearch: jest.fn(),
    getMoreFilesForSearch: jest.fn(),
    setSearchFilterType: jest.fn(),
    updateSearchTerms: jest.fn(),
    updateSearchTeam: jest.fn(),
    setSearchType: jest.fn(),
}));

const team = TestHelper.getTeamMock({id: 'team-id', name: 'test-team'});
const channel = TestHelper.getChannelMock({
    id: 'channel-id',
    name: 'town-square',
    display_name: 'Town Square',
    team_id: team.id,
});

function buildState() {
    return {
        entities: {
            general: {config: {}},
            preferences: {myPreferences: {}},
            teams: {
                currentTeamId: team.id,
                teams: {[team.id]: team},
                myMembers: {[team.id]: {team_id: team.id, user_id: 'user-id'}},
            },
            users: {
                currentUserId: 'user-id',
                profiles: {'user-id': TestHelper.getUserMock({id: 'user-id', locale: 'en'})},
            },
            channels: {
                currentChannelId: channel.id,
                channels: {[channel.id]: channel},
                myMembers: {
                    [channel.id]: {
                        channel_id: channel.id,
                        user_id: 'user-id',
                        mention_count: 2,
                        msg_count: 0,
                        last_viewed_at: 0,
                        notify_props: {mark_unread: 'all'},
                    },
                },
            },
        },
        views: {
            browser: {windowSize: WindowSizes.MOBILE_VIEW, focused: true},
        },
    } as unknown as GlobalState;
}

describe('components/narrow_views/MentionView', () => {
    it('opens the mentions list with the panel suppressed', () => {
        const {store} = renderWithContext(<MentionView/>, buildState());

        expect(screen.getByTestId('mentionView')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-mentions', 'true');

        expect(showMentions).toHaveBeenCalled();
        expect(store.getState().views.rhsSuppressed).toBe(true);
    });

    it('carries its own way back to the conversation', () => {
        renderWithContext(<MentionView/>, buildState());

        // The page is reached from the channel header, over a view that has no header of its
        // own, so the way back belongs to the page (R5).
        expect(screen.getByTestId('mentionViewBack')).toHaveAttribute('href', '/test-team/channels');
    });

    it('releases the panel and closes it when the entry is left', () => {
        const {store, unmount} = renderWithContext(<MentionView/>, buildState());

        expect(store.getState().views.rhsSuppressed).toBe(true);

        unmount();

        expect(store.getState().views.rhsSuppressed).toBe(false);
        expect(closeRightHandSide).toHaveBeenCalled();
    });
});
