// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createMemoryHistory} from 'history';
import React from 'react';
import {Route} from 'react-router-dom';
import type {RouteComponentProps} from 'react-router-dom';

import {runPostRenderAct, renderWithContext, screen} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import ChannelEntryRouter from './channel_entry_router';
import type {EntryRouteParams} from './channel_entry_router';

const team = TestHelper.getTeamMock({id: 'team-id', name: 'test-team'});

const townSquare = TestHelper.getChannelMock({
    id: 'channel-id',
    name: 'town-square',
    display_name: 'Town Square',
    team_id: team.id,
});

const offTopic = TestHelper.getChannelMock({
    id: 'off-topic-id',
    name: 'off-topic',
    display_name: 'Off-Topic',
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
                // Deliberately not the channel the entry address names, so selecting it is observable.
                currentChannelId: offTopic.id,
                channels: {[townSquare.id]: townSquare, [offTopic.id]: offTopic},
                channelsInTeam: {[team.id]: new Set([townSquare.id, offTopic.id])},
                myMembers: {
                    [townSquare.id]: {
                        channel_id: townSquare.id,
                        user_id: 'user-id',
                        mention_count: 0,
                        msg_count: 0,
                        last_viewed_at: 0,
                        notify_props: {mark_unread: 'all'},
                    },
                    [offTopic.id]: {
                        channel_id: offTopic.id,
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

// Mirrors the entry routes in channel_layout/center_channel/center_channel.tsx, plus a stand-in
// for the message view that catches any navigation away from the entry address.
function renderEntry(initialEntry: string) {
    const history = createMemoryHistory({initialEntries: [initialEntry]});

    const renderEntryView = (props: RouteComponentProps<EntryRouteParams>) => (
        <ChannelEntryRouter {...props}>
            <div data-testid='entryView'/>
        </ChannelEntryRouter>
    );

    const result = renderWithContext(
        <>
            <Route
                path='/:team/:path(channels)/:identifier/members'
                render={renderEntryView}
            />
            <Route
                path='/:team/:path(channels)/:identifier/mentions'
                render={renderEntryView}
            />
            <Route
                path='/:team/:path(channels|messages)/:identifier'
                render={() => <div data-testid='messageView'/>}
            />
        </>,
        buildState(),
        {history},
    );

    return {...result, history};
}

describe('components/narrow_views/ChannelEntryRouter', () => {
    it.each([
        ['members', '/test-team/channels/town-square/members'],
        ['mentions', '/test-team/channels/town-square/mentions'],
    ])('keeps the %s entry address and renders the entry view', async (_entry, url) => {
        const {history, unmount} = renderEntry(url);

        await runPostRenderAct(10);

        expect(screen.getByTestId('entryView')).toBeInTheDocument();

        // The entry address belongs to the route that rendered it, so mounting must not replace it
        // with the message view. Doing so replaced the entry the moment it opened, which is what
        // the bottom bar's Members and Notifications buttons did.
        expect(history.location.pathname).toBe(url);
        expect(history.length).toBe(1);

        unmount();
    });
});
