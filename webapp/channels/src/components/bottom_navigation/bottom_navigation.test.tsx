// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createMemoryHistory} from 'history';
import React from 'react';

import {act, fireEvent, renderWithContext, screen} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import {getSelectedEntry} from './bottom_navigation';

import BottomNavigation from './index';

const team = TestHelper.getTeamMock({id: 'team-id', name: 'test-team', display_name: 'Test Team'});
const channel = TestHelper.getChannelMock({id: 'channel-id', name: 'town-square', display_name: 'Town Square', team_id: team.id});
const otherChannel = TestHelper.getChannelMock({id: 'other-channel-id', name: 'off-topic', display_name: 'Off-Topic', team_id: team.id});
const currentUsername = 'current-user';

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
            users: {currentUserId: 'user-id', profiles: {'user-id': TestHelper.getUserMock({id: 'user-id', username: currentUsername, locale: 'en'})}},
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

type VisualViewportMock = {
    height: number;
    offsetTop: number;
    emitResize: () => void;
};

// jsdom has no visual viewport, so the test drives the one the keyboard yield reads.
function mockVisualViewport(initialHeight: number): VisualViewportMock {
    const listeners = new Set<() => void>();
    const viewport = {
        height: initialHeight,
        offsetTop: 0,
        addEventListener: (type: string, listener: () => void) => {
            if (type === 'resize') {
                listeners.add(listener);
            }
        },
        removeEventListener: (type: string, listener: () => void) => {
            if (type === 'resize') {
                listeners.delete(listener);
            }
        },
        emitResize: () => listeners.forEach((listener) => listener()),
    };

    Object.defineProperty(window, 'visualViewport', {configurable: true, value: viewport});

    return viewport;
}

function renderComposerAndBar(pathname: string) {
    return renderWithContext(
        <>
            <div id='post-create'>
                <textarea data-testid='composer'/>
            </div>
            <BottomNavigation/>
        </>,
        buildState(WindowSizes.MOBILE_VIEW),
        {history: createMemoryHistory({initialEntries: [pathname]})},
    );
}

describe('components/bottom_navigation', () => {
    describe('getSelectedEntry', () => {
        it('selects the chat entry on conversations, direct messages and any channel subpath', () => {
            expect(getSelectedEntry('/test-team/channels/town-square', 'test-team', currentUsername)).toBe('chat');
            expect(getSelectedEntry('/test-team/messages/@user', 'test-team', currentUsername)).toBe('chat');
            expect(getSelectedEntry('/test-team/channels', 'test-team', currentUsername)).toBe('chat');
            expect(getSelectedEntry('/test-team/channels/town-square/members', 'test-team', currentUsername)).toBe('chat');
            expect(getSelectedEntry('/direct_messages/user-id', 'test-team', currentUsername)).toBe('chat');
        });

        it('selects the notification entry only on the team-level mention address', () => {
            expect(getSelectedEntry('/test-team/mentions', 'test-team', currentUsername)).toBe('notifications');
        });

        it('selects the profile entry on the current user and leaves another user unselected', () => {
            expect(getSelectedEntry('/u/current-user', 'test-team', currentUsername)).toBe('me');
            expect(getSelectedEntry('/u/current-user/edit', 'test-team', currentUsername)).toBe('me');

            // The profile tree renders without a current team, so this rule must run before the team guard.
            expect(getSelectedEntry('/u/current-user', '', currentUsername)).toBe('me');
            expect(getSelectedEntry('/u/someone-else', 'test-team', currentUsername)).toBeNull();
        });

        it('leaves addresses without an entry unselected', () => {
            expect(getSelectedEntry('/test-team/plug/some-plugin', 'test-team', currentUsername)).toBeNull();
            expect(getSelectedEntry('/other-team/channels/town-square', 'test-team', currentUsername)).toBeNull();
        });
    });

    it('renders the three entries with their addresses in the narrow shell', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigation')).toBeInTheDocument();
        expect(screen.getByTestId('bottomNavigationEntry-chat')).toHaveAttribute('href', '/test-team/channels');
        expect(screen.getByTestId('bottomNavigationEntry-notifications')).toHaveAttribute('href', '/test-team/mentions');
        expect(screen.getByTestId('bottomNavigationEntry-me')).toHaveAttribute('href', '/u/current-user');
        expect(screen.queryByTestId('bottomNavigationEntry-messages')).not.toBeInTheDocument();
        expect(screen.queryByTestId('bottomNavigationEntry-members')).not.toBeInTheDocument();
    });

    it('does not render in the wide shell', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.SMALL_DESKTOP_VIEW);

        expect(screen.queryByTestId('bottomNavigation')).not.toBeInTheDocument();
    });

    it('marks the entry the address belongs to', () => {
        renderAt('/test-team/channels/town-square/members', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigationEntry-chat')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('bottomNavigationEntry-notifications')).not.toHaveAttribute('aria-current');
        expect(screen.getByTestId('bottomNavigationEntry-me')).not.toHaveAttribute('aria-current');
    });

    it('marks the profile entry on the personal profile', () => {
        renderAt('/u/current-user', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigationEntry-me')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('bottomNavigationEntry-chat')).not.toHaveAttribute('aria-current');
    });

    it('marks no entry on an address without an entry', () => {
        renderAt('/test-team/plug/some-plugin', WindowSizes.MOBILE_VIEW);

        expect(screen.getByTestId('bottomNavigation')).toBeInTheDocument();
        expect(screen.getByTestId('bottomNavigation').querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    });

    it('shows the mention count on the notification entry without writing it into the label', () => {
        const withMentions = renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW, {mentions: 12});

        const entry = withMentions.getByTestId('bottomNavigationEntry-notifications');
        expect(entry).toHaveAccessibleName(/12 mentions/);
        expect(entry.querySelector('.bottom-navigation__label')).toHaveTextContent('Notifications');

        withMentions.unmount();

        const withoutMentions = renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW);
        const plainEntry = withoutMentions.getByTestId('bottomNavigationEntry-notifications');
        expect(plainEntry).toHaveAccessibleName('Notifications');
        expect(plainEntry.querySelector('.badge-notify')).toBeNull();
    });

    it('yields while the left drawer is open', () => {
        renderAt('/test-team/channels/town-square', WindowSizes.MOBILE_VIEW, {lhsOpen: true});

        expect(screen.getByTestId('bottomNavigation')).toHaveClass('bottom-navigation--yielded');
    });

    describe('keyboard yield', () => {
        afterEach(() => {
            delete (window as {visualViewport?: unknown}).visualViewport;
        });

        it('yields only once the composer is focused and the visual viewport is compressed', () => {
            const viewport = mockVisualViewport(window.innerHeight);
            renderComposerAndBar('/test-team/channels/town-square');

            const bar = screen.getByTestId('bottomNavigation');
            const composer = screen.getByTestId('composer');

            fireEvent.focus(composer);
            expect(bar).not.toHaveClass('bottom-navigation--keyboard');

            viewport.height = window.innerHeight - 300;
            act(() => viewport.emitResize());
            expect(bar).toHaveClass('bottom-navigation--keyboard');
        });

        it('does not yield when the composer is focused without a keyboard', () => {
            mockVisualViewport(window.innerHeight);
            renderComposerAndBar('/test-team/channels/town-square');

            fireEvent.focus(screen.getByTestId('composer'));

            expect(screen.getByTestId('bottomNavigation')).not.toHaveClass('bottom-navigation--keyboard');
        });

        it('does not yield when the keyboard is up but the composer is not focused', () => {
            const viewport = mockVisualViewport(window.innerHeight - 300);
            renderComposerAndBar('/test-team/channels/town-square');

            act(() => viewport.emitResize());

            expect(screen.getByTestId('bottomNavigation')).not.toHaveClass('bottom-navigation--keyboard');
        });

        it('restores when the keyboard is hidden without a blur', () => {
            const viewport = mockVisualViewport(window.innerHeight);
            renderComposerAndBar('/test-team/channels/town-square');

            const bar = screen.getByTestId('bottomNavigation');
            const composer = screen.getByTestId('composer');

            fireEvent.focus(composer);
            viewport.height = window.innerHeight - 300;
            act(() => viewport.emitResize());
            expect(bar).toHaveClass('bottom-navigation--keyboard');

            viewport.height = window.innerHeight;
            act(() => viewport.emitResize());

            expect(bar).not.toHaveClass('bottom-navigation--keyboard');
        });

        it('restores when the composer loses focus', () => {
            const viewport = mockVisualViewport(window.innerHeight - 300);
            renderComposerAndBar('/test-team/channels/town-square');

            const bar = screen.getByTestId('bottomNavigation');
            const composer = screen.getByTestId('composer');

            fireEvent.focus(composer);
            act(() => viewport.emitResize());
            expect(bar).toHaveClass('bottom-navigation--keyboard');

            fireEvent.blur(composer);

            expect(bar).not.toHaveClass('bottom-navigation--keyboard');
        });
    });
});
