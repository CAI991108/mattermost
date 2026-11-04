// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import ChannelHeaderMenu from './channel_header_menu';

const team = TestHelper.getTeamMock({id: 'team-id', name: 'test-team'});
const user = TestHelper.getUserMock({id: 'user-id', username: 'user'});

function buildState(channelType: string) {
    const channel = TestHelper.getChannelMock({
        id: 'channel-id',
        name: 'town-square',
        display_name: 'Town Square',
        type: channelType as never,
        team_id: team.id,
    });

    return {
        entities: {
            general: {config: {}, license: {}},
            preferences: {myPreferences: {}},
            teams: {
                currentTeamId: team.id,
                teams: {[team.id]: team},
                myMembers: {[team.id]: {team_id: team.id, user_id: user.id}},
            },
            users: {
                currentUserId: user.id,
                profiles: {[user.id]: user},
            },
            channels: {
                currentChannelId: channel.id,
                channels: {[channel.id]: channel},
                myMembers: {
                    [channel.id]: {
                        channel_id: channel.id,
                        user_id: user.id,
                        roles: 'channel_user',
                        notify_props: {mark_unread: 'all'},
                    },
                },
            },
        },
        plugins: {components: {}},
    };
}

describe('components/channel_header_menu', () => {
    test('leads a narrow channel conversation to its information page without a menu of its own', () => {
        renderWithContext(
            <ChannelHeaderMenu isMobile={true}/>,
            buildState('O') as never,
        );

        expect(screen.getByTestId('channelHeaderTitleLink')).toHaveAttribute('href', '/test-team/channels/town-square/members');
        expect(screen.getByLabelText('town square channel menu')).toBeInTheDocument();

        // The channel menu now lives in the settings section of the information page, so the
        // header keeps no dropdown trigger of its own (R9, R10).
        expect(screen.queryByRole('button', {name: 'Channel menu'})).not.toBeInTheDocument();
    });

    test('keeps the title as the menu trigger outside the narrow channel conversation case', () => {
        renderWithContext(
            <ChannelHeaderMenu isMobile={true}/>,
            buildState('D') as never,
        );

        expect(screen.queryByTestId('channelHeaderTitleLink')).not.toBeInTheDocument();
        expect(document.querySelector('.channel-header__trigger')).not.toBeNull();
        expect(screen.queryByRole('button', {name: 'Channel menu'})).not.toBeInTheDocument();
    });
});
