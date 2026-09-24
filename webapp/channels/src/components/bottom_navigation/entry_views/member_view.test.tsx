// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {closeRightHandSide, showChannelFiles, showPinnedPosts} from 'actions/views/rhs';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import MemberView from './member_view';

jest.mock('actions/views/rhs', () => ({
    closeRightHandSide: jest.fn(() => ({type: 'MOCK_CLOSE_RHS'})),
    showChannelFiles: jest.fn(() => ({type: 'MOCK_SHOW_CHANNEL_FILES'})),
    showPinnedPosts: jest.fn(() => ({type: 'MOCK_SHOW_PINNED_POSTS'})),
}));

jest.mock('components/channel_members_rhs', () => () => <div data-testid='channelMembersRHS'/>);

jest.mock('components/search_results', () => (props: {isPinnedPosts: boolean; isChannelFiles: boolean}) => (
    <div
        data-testid='searchResults'
        data-pinned={String(props.isPinnedPosts)}
        data-files={String(props.isChannelFiles)}
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
                        mention_count: 0,
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

describe('components/bottom_navigation/entry_views/MemberView', () => {
    it('opens on the member list with the panel suppressed', () => {
        const {store} = renderWithContext(<MemberView/>, buildState());

        expect(screen.getByTestId('channelMembersRHS')).toBeInTheDocument();
        expect(screen.queryByTestId('searchResults')).not.toBeInTheDocument();
        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Members');

        // Nothing can be laid over the list while the entry is on screen (KTD8, R11).
        expect(store.getState().views.rhsSuppressed).toBe(true);
        expect(document.querySelector('#sidebar-right')).not.toBeInTheDocument();
        expect(document.querySelector('.sidebar--right')).not.toBeInTheDocument();
    });

    it('reaches the pinned posts and the files and comes back to the list', async () => {
        const {store} = renderWithContext(<MemberView/>, buildState());

        await userEvent.click(screen.getByTestId('memberSection-pinned'));
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-pinned', 'true');
        expect(screen.queryByTestId('channelMembersRHS')).not.toBeInTheDocument();
        expect(showPinnedPosts).toHaveBeenCalledWith(channel.id);
        expect(store.getState().views.rhsSuppressed).toBe(true);

        await userEvent.click(screen.getByTestId('memberSection-files'));
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-files', 'true');
        expect(screen.queryByTestId('channelMembersRHS')).not.toBeInTheDocument();
        expect(showChannelFiles).toHaveBeenCalledWith(channel.id);
        expect(store.getState().views.rhsSuppressed).toBe(true);

        await userEvent.click(screen.getByTestId('memberSection-members'));
        expect(screen.getByTestId('channelMembersRHS')).toBeInTheDocument();
        expect(screen.queryByTestId('searchResults')).not.toBeInTheDocument();
        expect(store.getState().views.rhsSuppressed).toBe(true);
    });

    it('moves between the sections with the arrow keys', async () => {
        renderWithContext(<MemberView/>, buildState());

        screen.getByTestId('memberSection-members').focus();

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-pinned')).toHaveFocus();
        expect(screen.getByTestId('memberSection-pinned')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-pinned', 'true');

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-files')).toHaveFocus();
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-files', 'true');

        await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
        expect(screen.getByTestId('memberSection-members')).toHaveFocus();
        expect(screen.getByTestId('channelMembersRHS')).toBeInTheDocument();

        // The selection wraps back to the last section from the first one.
        await userEvent.keyboard('{ArrowLeft}');
        expect(screen.getByTestId('memberSection-files')).toHaveFocus();
        expect(screen.getByTestId('searchResults')).toHaveAttribute('data-files', 'true');
    });

    it('releases the panel and closes it when the entry is left', () => {
        const {store, unmount} = renderWithContext(<MemberView/>, buildState());

        expect(store.getState().views.rhsSuppressed).toBe(true);

        unmount();

        expect(store.getState().views.rhsSuppressed).toBe(false);
        expect(closeRightHandSide).toHaveBeenCalled();
    });
});
