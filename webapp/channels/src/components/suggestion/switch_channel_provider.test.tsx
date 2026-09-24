// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';

import {General} from 'mattermost-redux/constants';

import {renderWithContext, screen, userEvent, waitFor} from 'tests/react_testing_utils';
import mockStore from 'tests/test_store';
import {StoragePrefixes} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import SwitchChannelProvider, {ConnectedSwitchChannelSuggestion} from './switch_channel_provider';

describe('components/SwitchChannelProvider', () => {
    const currentTeamId = 'currentTeamId';
    const currentUserId = 'current_user_id';

    const publicChannel = TestHelper.getChannelMock({
        id: 'public_channel',
        team_id: currentTeamId,
        type: General.OPEN_CHANNEL,
        name: 'public-channel',
        display_name: 'Public Channel',
        delete_at: 0,
    });
    const privateChannel = TestHelper.getChannelMock({
        id: 'private_channel',
        team_id: currentTeamId,
        type: General.PRIVATE_CHANNEL,
        name: 'private-channel',
        display_name: 'Private Channel',
        delete_at: 0,
    });
    const directChannel = TestHelper.getChannelMock({
        id: 'direct_channel',
        type: General.DM_CHANNEL,
        name: 'current_user_id__other_user',
        display_name: 'Direct Channel',
        delete_at: 0,
    });

    const defaultState = {
        entities: {
            general: {
                config: {},
            },
            channels: {
                myMembers: {
                    [publicChannel.id]: TestHelper.getChannelMembershipMock({
                        channel_id: publicChannel.id,
                        user_id: currentUserId,
                    }),
                    [privateChannel.id]: TestHelper.getChannelMembershipMock({
                        channel_id: privateChannel.id,
                        user_id: currentUserId,
                    }),
                    [directChannel.id]: TestHelper.getChannelMembershipMock({
                        channel_id: directChannel.id,
                        user_id: currentUserId,
                    }),
                },
                channels: {
                    [publicChannel.id]: publicChannel,
                    [privateChannel.id]: privateChannel,
                    [directChannel.id]: directChannel,
                },
                messageCounts: {},
            },
            preferences: {
                myPreferences: {},
            },
            teams: {
                currentTeamId,
                teams: {
                    [currentTeamId]: TestHelper.getTeamMock({
                        id: currentTeamId,
                        delete_at: 0,
                    }),
                },
                myMembers: {
                    [currentTeamId]: TestHelper.getTeamMembershipMock({
                        team_id: currentTeamId,
                        user_id: currentUserId,
                    }),
                },
            },
            users: {
                currentUserId,
                profiles: {},
            },
        },
    };

    function createProvider(state = defaultState) {
        const provider = new SwitchChannelProvider();
        provider.store = mockStore(state);
        provider.startNewRequest('');
        return provider;
    }

    test('formats only searchable public and private channels', () => {
        const provider = createProvider();

        const results = provider.formatGroup('channel', [
            publicChannel,
            privateChannel,
            directChannel,
        ]);

        expect(results.terms).toEqual(expect.arrayContaining([
            publicChannel.id,
            privateChannel.id,
        ]));
        expect(results.terms).not.toContain(directChannel.id);
        expect(results.items).toHaveLength(2);
    });

    test('returns no results when no channel matches', () => {
        const provider = createProvider();

        const results = provider.formatGroup('something-else', [
            publicChannel,
            privateChannel,
        ]);

        expect(results).toEqual({
            items: [],
            terms: [],
        });
    });

    test('can include a matching channel the user has not joined', () => {
        const unjoinedChannel = TestHelper.getChannelMock({
            id: 'unjoined_channel',
            team_id: currentTeamId,
            type: General.OPEN_CHANNEL,
            name: 'unjoined-channel',
            display_name: 'Unjoined Channel',
            delete_at: 0,
        });
        const provider = createProvider();

        expect(provider.formatGroup('unjoined', [unjoinedChannel]).items).toHaveLength(0);
        expect(provider.formatGroup('unjoined', [unjoinedChannel], false).terms).toEqual([unjoinedChannel.id]);
    });

    test('filters out channels belonging to archived teams', () => {
        const archivedTeamId = 'archivedTeam';
        const archivedChannel = TestHelper.getChannelMock({
            id: 'archived_channel',
            team_id: archivedTeamId,
            type: General.OPEN_CHANNEL,
            name: 'archived-channel',
            display_name: 'Archived Channel',
            delete_at: 0,
        });
        const state = {
            ...defaultState,
            entities: {
                ...defaultState.entities,
                teams: {
                    ...defaultState.entities.teams,
                    teams: {
                        ...defaultState.entities.teams.teams,
                        [archivedTeamId]: TestHelper.getTeamMock({
                            id: archivedTeamId,
                            delete_at: 1,
                        }),
                    },
                },
            },
        };
        const provider = createProvider(state);

        expect(provider.removeChannelsFromArchivedTeams([
            publicChannel,
            archivedChannel,
        ])).toEqual([publicChannel]);
    });
});

describe('SwitchChannelSuggestion', () => {
    const baseProps = {
        id: 'test-suggestion',
        matchedPretext: '',
        isSelection: false,
        onClick: jest.fn(),
        onMouseMove: jest.fn(),
    };

    const currentUserId = 'currentUser';

    const team1 = TestHelper.getTeamMock({id: 'team1', display_name: 'Team One'});
    const team2 = TestHelper.getTeamMock({id: 'team2', display_name: 'Team Two'});

    function getBaseState(teams: Team[], channels: Channel[]): any {
        return {
            entities: {
                channels: {
                    channels: channels.reduce((channelsMap, channel) => ({...channelsMap, [channel.id]: channel}), {}),
                    myMembers: channels.reduce((membersMap, channel) => ({
                        ...membersMap,
                        [channel.id]: TestHelper.getChannelMembershipMock({channel_id: channel.id, user_id: currentUserId}),
                    }), {}),
                },
                teams: {
                    teams: teams.reduce((teamsMap, team) => ({...teamsMap, [team.id]: team}), {}),
                    myMembers: teams.reduce((membersMap, team) => ({
                        ...membersMap,
                        [team.id]: TestHelper.getTeamMembershipMock({team_id: team.id, user_id: currentUserId}),
                    }), {}),
                },
            },
        };
    }

    test('should show the team name for channels if the user is on multiple teams', () => {
        const channel1 = TestHelper.getChannelMock({id: 'channel1', team_id: 'team1', name: 'channel_one', display_name: 'Channel One'});

        const {replaceStoreState} = renderWithContext(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel1.name}
                item={{
                    channel: channel1,
                    name: channel1.name,
                    deactivated: false,
                }}
            />,
            getBaseState([team1], [channel1]),
        );

        const suggestion = document.getElementById(baseProps.id);

        // When the user is on only a single team, the channel's URL name is displayed
        expect(screen.getByText(`~${channel1.name}`)).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel1.name} Public channel`);

        replaceStoreState(getBaseState([team1, team2], [channel1]));

        // When the user is on multiple teams, we show the team's display name instead
        expect(screen.getByText(team1.display_name)).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`${team1.display_name} Public channel`);
    });

    test('should show the type of channel', () => {
        const channel1 = TestHelper.getChannelMock({id: 'channel1', team_id: 'team1', name: 'channel_one', display_name: 'Channel One', type: General.OPEN_CHANNEL});
        const channel2 = TestHelper.getChannelMock({id: 'channel2', team_id: 'team1', name: 'channel_two', display_name: 'Channel Two', type: General.PRIVATE_CHANNEL});

        const {rerender} = renderWithContext(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel1.name}
                item={{
                    channel: channel1,
                    name: channel1.name,
                    deactivated: false,
                }}
            />,
            getBaseState([team1], [channel1, channel2]),
        );

        const suggestion = document.getElementById(baseProps.id);

        expect(screen.getByLabelText('Public channel')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel1.name} Public channel`);

        rerender(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel2.name}
                item={{
                    channel: channel2,
                    name: channel2.name,
                    deactivated: false,
                }}
            />,
        );

        expect(screen.getByLabelText('Private channel')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel2.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel2.name} Private channel`);
    });

    test('should show if the channel has a draft instead of the channel type', () => {
        const channel1 = TestHelper.getChannelMock({id: 'channel1', team_id: 'team1', name: 'channel_one', display_name: 'Channel One'});
        const channel2 = TestHelper.getChannelMock({id: 'channel2', team_id: 'team1', name: 'channel_two', display_name: 'Channel Two'});

        const testState = getBaseState([team1], [channel1, channel2]);
        testState.storage = {
            storage: {
                [`${StoragePrefixes.DRAFT}${channel2.id}`]: {
                    value: TestHelper.getPostDraftMock({message: 'post draft'}),
                },
            },
        };

        const {rerender} = renderWithContext(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel1.name}
                item={{
                    channel: channel1,
                    name: channel1.name,
                    deactivated: false,
                }}
            />,
            testState,
        );

        const suggestion = document.getElementById(baseProps.id);

        expect(screen.queryByLabelText('Has draft')).not.toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel1.name} Public channel`);

        rerender(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel2.name}
                item={{
                    channel: channel2,
                    name: channel2.name,
                    deactivated: false,
                }}
            />,
        );

        expect(screen.queryByLabelText('Has draft')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel2.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel2.name} Has draft`);
    });

    test('should show if the channel is archived instead of the channel type', () => {
        const channel1 = TestHelper.getChannelMock({id: 'channel1', team_id: 'team1', name: 'channel_one', display_name: 'Channel One'});
        const channel2 = TestHelper.getChannelMock({id: 'channel2', team_id: 'team1', name: 'channel_two', display_name: 'Channel Two', delete_at: 1});

        const {rerender} = renderWithContext(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel1.name}
                item={{
                    channel: channel1,
                    name: channel1.name,
                    deactivated: false,
                }}
            />,
            getBaseState([team1], [channel1, channel2]),
        );

        const suggestion = document.getElementById(baseProps.id);

        expect(screen.queryByLabelText('Archved channel')).not.toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel1.name} Public channel`);

        rerender(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel2.name}
                item={{
                    channel: channel2,
                    name: channel2.name,
                    deactivated: false,
                }}
            />,
        );

        expect(screen.queryByLabelText('Archived channel')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel2.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel2.name} Archived channel`);
    });

    test('should show if the channel has unread mentions', () => {
        const channel1 = TestHelper.getChannelMock({id: 'channel1', team_id: 'team1', name: 'channel_one', display_name: 'Channel One'});
        const channel2 = TestHelper.getChannelMock({id: 'channel2', team_id: 'team1', name: 'channel_two', display_name: 'Channel Two'});
        const channel3 = TestHelper.getChannelMock({id: 'channel3', team_id: 'team1', name: 'channel_three', display_name: 'Channel Three'});

        const testState = getBaseState([team1], [channel1, channel2, channel3]);
        testState.entities.channels.myMembers[channel1.id].mention_count = 0;
        testState.entities.channels.myMembers[channel2.id].mention_count = 1;
        testState.entities.channels.myMembers[channel3.id].mention_count = 5;

        const {rerender} = renderWithContext(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel1.name}
                item={{
                    channel: channel1,
                    name: channel1.name,
                    deactivated: false,
                }}
            />,
            testState,
        );

        const suggestion = document.getElementById(baseProps.id);

        expect(screen.queryByLabelText(/unread/, {exact: false})).not.toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel1.display_name);
        expect(suggestion).toHaveAccessibleDescription(`~${channel1.name} Public channel`);

        rerender(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel2.name}
                item={{
                    channel: channel2,
                    name: channel2.name,
                    deactivated: false,
                }}
            />,
        );

        expect(screen.queryByLabelText('1 unread notification')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel2.display_name);
        expect(suggestion).toHaveAccessibleDescription(`1 unread notification ~${channel2.name} Public channel`);

        rerender(
            <ConnectedSwitchChannelSuggestion
                {...baseProps}
                term={channel3.name}
                item={{
                    channel: channel3,
                    name: channel3.name,
                    deactivated: false,
                }}
            />,
        );

        expect(screen.queryByLabelText('5 unread notifications')).toBeInTheDocument();
        expect(suggestion).toHaveAccessibleName(channel3.display_name);
        expect(suggestion).toHaveAccessibleDescription(`5 unread notifications ~${channel3.name} Public channel`);
    });

    describe('layout and tooltip behavior for long names', () => {
        const longTeam1 = TestHelper.getTeamMock({
            id: 'team1',
            display_name: 'A Very Long Team Display Name That Will Likely Overflow Its Slot In The Switcher',
        });
        const longTeam2 = TestHelper.getTeamMock({
            id: 'team2',
            display_name: 'Another Long Team Two',
        });
        const longChannel = TestHelper.getChannelMock({
            id: 'channel1',
            team_id: 'team1',
            name: 'super_long_channel_name',
            display_name: 'Super Extremely Long Channel Display Name That Should Truncate With An Ellipsis',
        });

        afterEach(() => {
            // reset prototype overrides between tests
            Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {configurable: true, value: 0});
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {configurable: true, value: 0});
        });

        test('should render team name as a sibling of the primary column wrapper inside .suggestion-list__flex when on multiple teams', () => {
            renderWithContext(
                <ConnectedSwitchChannelSuggestion
                    {...baseProps}
                    term={longChannel.name}
                    item={{
                        channel: longChannel,
                        name: longChannel.name,
                        deactivated: false,
                    }}
                />,
                getBaseState([longTeam1, longTeam2], [longChannel]),
            );

            const suggestion = document.getElementById(baseProps.id) as HTMLElement;
            expect(suggestion).toBeInTheDocument();

            // Both nodes (channel name and team name) are present
            expect(screen.getByText(longChannel.display_name)).toBeInTheDocument();
            expect(screen.getByText(longTeam1.display_name)).toBeInTheDocument();

            // The flex row contains the primary column wrapper and the team name as siblings
            const flexRow = suggestion.querySelector('.suggestion-list__flex') as HTMLElement;
            expect(flexRow).not.toBeNull();

            const primaryColumn = flexRow.querySelector(':scope > .suggestion-list__switch-channel-primary');
            expect(primaryColumn).not.toBeNull();

            const teamNameNode = flexRow.querySelector('.suggestion-list__team-name');
            expect(teamNameNode).not.toBeNull();
            expect(teamNameNode).toHaveTextContent(longTeam1.display_name);

            // Team name must live outside the primary column so it remains a flex sibling that doesn't shrink with the channel name.
            expect(primaryColumn!.contains(teamNameNode)).toBe(false);

            // Channel name span should live inside the primary column with the truncation class
            const channelNameNode = primaryColumn!.querySelector('.suggestion-list__channel-name-text');
            expect(channelNameNode).not.toBeNull();
            expect(channelNameNode).toHaveTextContent(longChannel.display_name);
        });

        test('should disable the channel-name and team-name tooltips when the names fit their containers', async () => {
            jest.useFakeTimers();

            Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {configurable: true, value: 100});
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {configurable: true, value: 100});

            renderWithContext(
                <ConnectedSwitchChannelSuggestion
                    {...baseProps}
                    term={longChannel.name}
                    item={{
                        channel: longChannel,
                        name: longChannel.name,
                        deactivated: false,
                    }}
                />,
                getBaseState([longTeam1, longTeam2], [longChannel]),
            );

            const channelNameNode = screen.getByText(longChannel.display_name);
            await userEvent.hover(channelNameNode, {advanceTimers: jest.advanceTimersByTime});
            jest.advanceTimersByTime(1000);
            expect(screen.queryAllByText(longChannel.display_name)).toHaveLength(1);

            const teamNameNode = screen.getByText(longTeam1.display_name);
            await userEvent.hover(teamNameNode, {advanceTimers: jest.advanceTimersByTime});
            jest.advanceTimersByTime(1000);
            expect(screen.queryAllByText(longTeam1.display_name)).toHaveLength(1);

            jest.useRealTimers();
        });

        test('should enable the channel-name and team-name tooltips when the names overflow their containers', async () => {
            jest.useFakeTimers();

            Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {configurable: true, value: 500});
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {configurable: true, value: 100});

            renderWithContext(
                <ConnectedSwitchChannelSuggestion
                    {...baseProps}
                    term={longChannel.name}
                    item={{
                        channel: longChannel,
                        name: longChannel.name,
                        deactivated: false,
                    }}
                />,
                getBaseState([longTeam1, longTeam2], [longChannel]),
            );

            const channelNameNode = screen.getByText(longChannel.display_name);
            await userEvent.hover(channelNameNode, {advanceTimers: jest.advanceTimersByTime});
            await waitFor(() => {
                expect(screen.queryAllByText(longChannel.display_name)).toHaveLength(2);
            });

            await userEvent.unhover(channelNameNode, {advanceTimers: jest.advanceTimersByTime});
            await waitFor(() => {
                expect(screen.queryAllByText(longChannel.display_name)).toHaveLength(1);
            });

            const teamNameNode = screen.getByText(longTeam1.display_name);
            await userEvent.hover(teamNameNode, {advanceTimers: jest.advanceTimersByTime});
            await waitFor(() => {
                expect(screen.queryAllByText(longTeam1.display_name)).toHaveLength(2);
            });

            jest.useRealTimers();
        });
    });
});
