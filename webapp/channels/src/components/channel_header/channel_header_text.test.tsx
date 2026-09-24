// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import ChannelHeaderText from './channel_header_text';

describe('ChannelHeaderText', () => {
    test('should render channel header text when header exists for a channel', () => {
        const channel = TestHelper.getChannelMock({header: 'Test Header'});
        renderWithContext(
            <ChannelHeaderText
                channel={channel}
            />,
        );

        expect(screen.getByText('Test Header')).toBeInTheDocument();
    });

    test('should render channel header of bot description for bot DM channels', () => {
        const channel = TestHelper.getChannelMock({type: 'D'});
        const botDm = TestHelper.getUserMock({is_bot: true, bot_description: 'Tranquility'});

        renderWithContext(
            <ChannelHeaderText
                channel={channel}
                dmUser={botDm}
            />,
        );

        expect(screen.getByText('Tranquility')).toBeInTheDocument();
    });

    test('should return null if the channel has no header and is archived', () => {
        const channel = TestHelper.getChannelMock({delete_at: 1, header: ''});

        const {container} = renderWithContext(
            <ChannelHeaderText
                channel={channel}
            />,
        );

        expect(container.childNodes.length).toBe(0);
    });

    test('should return null if its a bot DM channels and its description is empty', () => {
        const channel = TestHelper.getChannelMock({type: 'D'});
        const botDm = TestHelper.getUserMock({is_bot: true, bot_description: ''});

        const {container} = renderWithContext(
            <ChannelHeaderText
                channel={channel}
                dmUser={botDm}
            />,
        );

        expect(container.childNodes.length).toBe(0);
    });

    test('should not show an add header button for DM channels without a header', () => {
        const channel = TestHelper.getChannelMock({type: 'D', header: ''});

        const {container} = renderWithContext(
            <ChannelHeaderText
                channel={channel}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    test('should not show an add header button for GM channels without a header', () => {
        const channel = TestHelper.getChannelMock({type: 'G', header: ''});

        const {container} = renderWithContext(
            <ChannelHeaderText
                channel={channel}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    test('should not show add header button when user lacks permission and channel doesn not have header', () => {
        const channel = TestHelper.getChannelMock({
            type: 'O',
            header: '',
        });

        const state = {
            entities: {
                channels: {
                    channels: {
                        [channel.id]: channel,
                    },
                },
                roles: {
                    roles: {
                        channel_user: {
                            permissions: [],
                        },
                    },
                },
            },
        };

        renderWithContext(
            <ChannelHeaderText
                channel={channel}
            />,
            state,
        );

        expect(screen.queryByText('Add a channel header')).not.toBeInTheDocument();
    });
});
