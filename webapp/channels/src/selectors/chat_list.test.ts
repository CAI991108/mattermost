// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {GlobalState} from 'types/store';
import {TestHelper} from 'utils/test_helper';

import {getChatListEntries} from './chat_list';

describe('selectors/chat_list', () => {
    const currentUserId = 'user1';
    const team = TestHelper.getTeamMock({id: 'team1', name: 'cai'});

    const alpha = TestHelper.getChannelMock({
        id: 'channel-alpha',
        type: 'O',
        name: 'alpha',
        display_name: 'Alpha',
        team_id: team.id,
        last_post_at: 300,
        create_at: 100,
    });
    const dm = TestHelper.getChannelMock({
        id: 'channel-dm',
        type: 'D',
        name: `${currentUserId}__user2`,
        display_name: '',
        team_id: '',
        last_post_at: 500,
        create_at: 100,
    });
    const group = TestHelper.getChannelMock({
        id: 'channel-group',
        type: 'G',
        name: 'groupbeef',
        display_name: 'Project group',
        team_id: '',
        last_post_at: 100,
        create_at: 100,
    });
    const otherTeamChannel = TestHelper.getChannelMock({
        id: 'channel-other',
        type: 'O',
        name: 'other',
        team_id: 'team2',
        last_post_at: 900,
        create_at: 100,
    });

    function buildState(overrides: {muteAlpha?: boolean} = {}): GlobalState {
        const alphaMembership = TestHelper.getChannelMembershipMock(
            {channel_id: alpha.id, user_id: currentUserId, mention_count: 2},
            overrides.muteAlpha ? {mark_unread: 'mention'} : undefined,
        );

        return {
            entities: {
                channels: {
                    channels: {
                        [alpha.id]: alpha,
                        [dm.id]: dm,
                        [group.id]: group,
                        [otherTeamChannel.id]: otherTeamChannel,
                    },
                    myMembers: {
                        [alpha.id]: alphaMembership,
                        [dm.id]: TestHelper.getChannelMembershipMock({channel_id: dm.id, user_id: currentUserId}),
                        [group.id]: TestHelper.getChannelMembershipMock({channel_id: group.id, user_id: currentUserId}),
                        [otherTeamChannel.id]: TestHelper.getChannelMembershipMock({channel_id: otherTeamChannel.id, user_id: currentUserId}),
                    },
                },
                users: {
                    currentUserId,
                    profiles: {
                        [currentUserId]: TestHelper.getUserMock({id: currentUserId, username: 'me'}),
                        user2: TestHelper.getUserMock({id: 'user2', username: 'alice'}),
                    },
                },
                teams: {
                    currentTeamId: team.id,
                    teams: {[team.id]: team},
                },
            },
        } as unknown as GlobalState;
    }

    test('mixes channels, direct messages and group messages into one recency ordered list', () => {
        const entries = getChatListEntries(buildState());

        expect(entries.map((entry) => entry.id)).toEqual([dm.id, alpha.id, group.id]);
        expect(entries.map((entry) => entry.kind)).toEqual(['direct', 'channel', 'group']);
    });

    test('addresses each kind of conversation at the route that opens it', () => {
        const entries = getChatListEntries(buildState());

        expect(entries[0].path).toBe('/cai/messages/@alice');
        expect(entries[1].path).toBe('/cai/channels/alpha');
        expect(entries[2].path).toBe(`/cai/messages/${group.name}`);
    });

    test('leaves out conversations of another team, since the page shows the current team', () => {
        const entries = getChatListEntries(buildState());

        expect(entries.some((entry) => entry.id === otherTeamChannel.id)).toBe(false);
    });

    test('keeps a muted conversation in place and only marks it', () => {
        const entries = getChatListEntries(buildState({muteAlpha: true}));
        const muted = entries.find((entry) => entry.id === alpha.id);

        expect(entries).toHaveLength(3);
        expect(muted?.muted).toBe(true);
        expect(muted?.unreadMentions).toBe(2);
    });

    test('falls back to the channel creation time when it never had a post', () => {
        const state = buildState();
        state.entities.channels.channels[group.id] = {...group, last_post_at: 0, create_at: 700};

        expect(getChatListEntries(state)[0].id).toBe(group.id);
    });
});
