// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ChannelType} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {renderWithContext, screen, waitFor, userEvent} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';

import type {GlobalState} from 'types/store';

import Member from './member';
import type {ChannelMember} from './member_list';

describe('components/channel_members_rhs/Member', () => {
    const baseProps = {
        channel: {
            id: 'channel_id',
            display_name: 'Test Channel',
            name: 'test-channel',
            type: 'O' as ChannelType,
            create_at: 1234567890,
            update_at: 1234567890,
            delete_at: 0,
            creator_id: 'creator_id',
            header: '',
            purpose: '',
            last_post_at: 1234567890,
            last_root_post_at: 1234567890,
            team_id: 'team_id',
            scheme_id: '',
            group_constrained: false,
        },
        index: 0,
        totalUsers: 5,
        editing: false,
        actions: {
            openDirectMessage: jest.fn(),
            fetchRemoteClusterInfo: jest.fn(),
        },
    };

    const mockUser: UserProfile = {
        id: 'user_id',
        create_at: 1234567890,
        update_at: 1234567890,
        delete_at: 0,
        username: 'testuser',
        password: '',
        auth_data: '',
        auth_service: '',
        email: 'test@example.com',
        nickname: 'Test User',
        first_name: 'Test',
        last_name: 'User',
        position: '',
        roles: 'system_user',
        props: {},
        notify_props: {
            email: 'true',
            push: 'mention',
            desktop: 'mention',
            desktop_sound: 'true',
            calls_desktop_sound: 'true',
            mark_unread: 'all',
            push_status: 'online',
            comments: 'never',
            mention_keys: '',
            highlight_keys: '',
            channel: 'true',
            first_name: 'false',
            auto_responder_active: 'false',
            auto_responder_message: '',
        },
        last_password_update: 1234567890,
        last_picture_update: 1234567890,
        last_activity_at: 1234567890,
        failed_attempts: 0,
        locale: 'en',
        timezone: {
            useAutomaticTimezone: 'true',
            automaticTimezone: '',
            manualTimezone: '',
        },
        mfa_active: false,
        is_bot: false,
        bot_description: '',
        terms_of_service_id: '',
        terms_of_service_create_at: 0,
    };

    const baseMember: ChannelMember = {
        user: mockUser,
        membership: {
            channel_id: 'channel_id',
            user_id: 'user_id',
            roles: 'channel_user',
            last_viewed_at: 1234567890,
            msg_count: 0,
            msg_count_root: 0,
            mention_count: 0,
            mention_count_root: 0,
            urgent_mention_count: 0,
            notify_props: {
                desktop: 'default',
                email: 'default',
                mark_unread: 'all',
                push: 'default',
                ignore_channel_mentions: 'default',
            },
            last_update_at: 1234567890,
            scheme_user: true,
            scheme_admin: false,
        },
        status: 'online',
        displayName: 'Test User',
    };

    const initialState = {
        entities: {
            sharedChannels: {
                remotesByRemoteId: {
                    remote_id_123: {
                        remote_id: 'remote_id_123',
                        display_name: 'Remote Organization',
                        site_url: 'https://remote.example.com',
                    },
                },
            },
        },
    };

    const mobileState = {
        ...initialState,
        views: {browser: {windowSize: WindowSizes.MOBILE_VIEW, focused: true}},
    } as unknown as GlobalState;

    test('should render local user without shared indicator', () => {
        const localMember = {
            ...baseMember,
            user: {
                ...mockUser,
                remote_id: '',
            },
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={localMember}
            />,
            initialState,
        );

        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.queryByTestId('SharedChannelIcon')).not.toBeInTheDocument();
    });

    test('should render remote user with shared indicator', () => {
        const remoteMember = {
            ...baseMember,
            user: {
                ...mockUser,
                remote_id: 'remote_id_123',
            },
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={remoteMember}
            />,
            initialState,
        );

        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByTestId('SharedChannelIcon')).toBeInTheDocument();
    });

    test('should show remote organization name in tooltip for remote user', async () => {
        jest.useFakeTimers();

        const remoteMember: ChannelMember = {
            user: {
                ...mockUser,
                remote_id: 'remote_id_123',
            },
            membership: baseMember.membership,
            status: baseMember.status,
            displayName: baseMember.displayName,
            remoteDisplayName: 'Remote Organization',
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={remoteMember}
            />,
            initialState,
        );

        const icon = screen.getByTestId('SharedChannelIcon');
        expect(icon).toBeInTheDocument();

        await userEvent.hover(icon, {advanceTimers: jest.advanceTimersByTime});

        await waitFor(() => {
            expect(screen.getByText('Shared with: Remote Organization')).toBeInTheDocument();
        });
    });

    test('should show generic tooltip for remote user when remote display name not available', async () => {
        jest.useFakeTimers();

        const remoteMember = {
            ...baseMember,
            user: {
                ...mockUser,
                remote_id: 'unknown_remote_id',
            },
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={remoteMember}
            />,
            initialState,
        );

        const icon = screen.getByTestId('SharedChannelIcon');
        expect(icon).toBeInTheDocument();

        await userEvent.hover(icon, {advanceTimers: jest.advanceTimersByTime});

        await waitFor(() => {
            expect(screen.getByText('Shared with trusted organizations')).toBeInTheDocument();
        });
    });

    test('should render guest tag for guest user', () => {
        const guestMember = {
            ...baseMember,
            user: {
                ...mockUser,
                roles: 'system_guest',
            },
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={guestMember}
            />,
            initialState,
        );

        expect(screen.getByText('Guest')).toBeInTheDocument();
    });

    test('should open the direct message from the row and the profile popover from the avatar on a touch screen', async () => {
        const openDirectMessage = jest.fn();

        renderWithContext(
            <>
                <div id='root-portal'/>
                <Member
                    {...baseProps}
                    actions={{...baseProps.actions, openDirectMessage}}
                    member={baseMember}
                />
            </>,
            mobileState,
        );

        const avatar = document.querySelector('.channel-members-rhs__avatar-popover');
        expect(avatar).not.toBeNull();

        // The whole row opens the direct message...
        const rowButton = screen.getByText('Test User').closest('button');
        expect(rowButton).not.toBeNull();
        await userEvent.click(rowButton as Element);
        expect(openDirectMessage).toHaveBeenCalledWith(mockUser);

        // ...while the avatar is the separate way into the profile popover.
        await userEvent.click(avatar as Element);
        expect(document.querySelector('.user-profile-popover-floating-overlay')).toBeInTheDocument();
        expect(openDirectMessage).toHaveBeenCalledTimes(1);
    });

    test('should keep the desktop row contract on a wide screen', () => {
        renderWithContext(
            <Member
                {...baseProps}
                member={baseMember}
            />,
            initialState,
        );

        expect(screen.getByTestId('memberline-user_id')).not.toHaveClass('channel-members-rhs__member--touch');
        expect(document.querySelector('.channel-members-rhs__avatar-popover')).toBeNull();
        expect(document.querySelector('.profileSpan_userInfo')).not.toBeNull();
    });

    test('should keep the send button and the whole member name reachable on a touch screen', () => {
        const longNameMember: ChannelMember = {
            ...baseMember,
            displayName: 'Alexandra The Third Of Her Name',
            user: {...mockUser, nickname: 'Alexandra The Third Of Her Name'},
        };

        renderWithContext(
            <Member
                {...baseProps}
                member={longNameMember}
            />,
            mobileState,
        );

        expect(screen.getByTestId('memberline-user_id')).toHaveClass('channel-members-rhs__member--touch');
        expect(screen.getByRole('button', {name: 'Send message'})).toBeInTheDocument();
        expect(screen.getByText('Alexandra The Third Of Her Name')).toBeInTheDocument();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });
});
