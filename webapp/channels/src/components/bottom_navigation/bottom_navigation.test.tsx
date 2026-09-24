// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createMemoryHistory} from 'history';
import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import {getSelectedEntry} from './bottom_navigation';

import BottomNavigation from './index';

const team = TestHelper.getTeamMock({id: 'team-id', name: 'test-team', display_name: 'Test Team'});
const channel = TestHelper.getChannelMock({id: 'channel-id', name: 'town-square', display_name: 'Town Square', team_id: team.id});
const otherChannel = TestHelper.getChannelMock({id: 'other-channel-id', name: 'off-topic', display_name: 'Off-Topic', team_id: team.id});

function membership(channelId: string, mentions: number) {
    return {
        channel_id: channelId,
        user_id: 'user-id',
        mention_count: mentions,
        msg_count: 0,
        last_viewed_at: 0,
        notify_props: {mark_unread: 'all'},
    };
}

function buildState(windowSize: WindowSizes, options?: {lhsOpen?: boolean; mentions?: number}) {
    const mentions = options?.mentions ?? 0;

    return {
        entities: {
            general: {config: {}},
            preferences: {myPreferences: {}},
            threads: {counts: {}},
            teams: {
                currentTeamId: team.id,
                teams: {[team.id]: team},
                myMembers: {[team.id]: {team_id: team.id, user_id: 'user-id'}},
            },
            users: {currentUserId: 'user-id', profiles: {'user-id': TestHelper.getUserMock({id: 'user-id', locale: 'en'})}},
            channels: {
                currentChannelId: channel.id,
                channels: {[channel.id]: channel, [otherChannel.id]: otherChannel},
                myMembers: {
                    [channel.id]: membership(channel.id, 0),
                    [otherChannel.id]: membership(otherChannel.id, mentions),
                },
                messageCounts: {[channel.id]: {total: 5}, [otherChannel.id]: {total: 5}},
            },
        },
        views: {
            browser: {windowSize, focused: true},
            lhs: {isOpen: options?.lhsOpen ?? false},
        },
    } as unknown as GlobalState;
}

function renderAt(pathname: string, windowSize: WindowSizes, options?: {lhsOpen?: boolean; mentions?: number}) {
    return renderWithContext(
        <BottomNavigation/>,
        buildState(windowSize, options),
        {history: createMemoryHistory({initialEntries: [pathname]})},
    );
}

describe('components/bottom_navigation', () => {
    describe('getSelectedEntry', () => {
        it('derives the entry from the address and leaves addresses without an entry unselected', () => {
            expect(getSelectedEntry('/test-team/channels/town-square', 'test-team')).toBe('messages');
            expect(getSelectedEntry('/test-team/messages/@user', 'test-team')).toBe('messages');
            expect(getSelectedEntry('/direct_messages/user-id', 'test-team')).toBe('messages');
            expect(getSelectedEntry('/test-team/channels', 'test-team')).toBe('channels');
            expect(getSelectedEntry('/test-team/channels/town-square/members', 'test-team')).toBe('members');
            expect(getSelectedEntry('/test-team/channels/town-square/mentions', 'test-team')).toBe('notifications');
            expect(getSelectedEntry('/test-team/plug/some-plugin', 'test-team')).toBeNull();
            expect(getSelectedEntry('/other-team/channels/town-square', 'test-team')).toBeNull();
        });
    });

    it('renders the four entries with their addresses in the narrow shell', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigation')).toBeInTheDocument();
        expect(screen.getByTestId('bottomNavigationEntry-messages')).toHaveAttribute('href', '/test-team/channels/town-square');
        expect(screen.getByTestId('bottomNavigationEntry-channels')).toHaveAttribute('href', '/test-team/channels');
        expect(screen.getByTestId('bottomNavigationEntry-members')).toHaveAttribute('href', '/test-team/channels/town-square/members');
        expect(screen.getByTestId('bottomNavigationEntry-notifications')).toHaveAttribute('href', '/test-team/channels/town-square/mentions');
    });

    it('does not render in the wide shell', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.SMALL_DESKTOP_VIEW);

        expect(screen.queryByTestId('bottomNavigation')).not.toBeInTheDocument();
    });

    it('marks the entry the address belongs to', () => {
        renderAt('/test-team/channels/town-square/members', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigationEntry-members')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('bottomNavigationEntry-messages')).not.toHaveAttribute('aria-current');
        expect(screen.getByTestId('bottomNavigationEntry-channels')).not.toHaveAttribute('aria-current');
        expect(screen.getByTestId('bottomNavigationEntry-notifications')).not.toHaveAttribute('aria-current');
    });

    it('marks no entry on an address without an entry', () => {
        renderAt('/test-team/plug/some-plugin', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigation')).toBeInTheDocument();
        expect(screen.getByTestId('bottomNavigation').querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    });

    it('shows the mention count on the notification entry and drops it when there is none', () => {
        const withMentions = renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW, {mentions: 12});

        expect(withMentions.getByTestId('bottomNavigationEntry-notifications').textContent).toContain('12');
        expect(withMentions.getByTestId('bottomNavigationEntry-notifications')).toHaveAccessibleName(/12 mentions/);
        withMentions.unmount();

        const withoutMentions = renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW);
        expect(withoutMentions.queryByText('12')).not.toBeInTheDocument();
        expect(withoutMentions.getByTestId('bottomNavigationEntry-notifications')).toHaveAccessibleName('Notifications');
    });

    it('yields while the left drawer is open', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW, {lhsOpen: true});

        expect(screen.getByTestId('bottomNavigation')).toHaveClass('bottom-navigation--yielded');
    });
});
