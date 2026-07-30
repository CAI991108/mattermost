// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext} from 'tests/react_testing_utils';

import DirectMessagesController from './direct_messages_controller';

jest.mock('mattermost-redux/actions/channels', () => ({
    fetchAllMyChannelMembers: () => () => new Promise(() => {}),
    fetchAllMyTeamsChannels: () => () => new Promise(() => {}),
}));

jest.mock('components/resizable_sidebar/resizable_lhs', () => () => <div/>);
jest.mock('./direct_messages_center', () => () => <div/>);
jest.mock('./direct_messages_sidebar', () => () => <div/>);

describe('DirectMessagesController', () => {
    beforeEach(() => {
        document.body.classList.remove('app__body', 'channel-view');
    });

    it('applies the themed channel layout while mounted', () => {
        const {getByTestId, unmount} = renderWithContext(
            <DirectMessagesController {...({} as any)}/>,
            {
                views: {
                    lhs: {
                        isOpen: false,
                    },
                    rhs: {
                        isSidebarOpen: false,
                    },
                    rhsSuppressed: false,
                },
            },
        );

        expect(document.body).toHaveClass('channel-view');
        expect(getByTestId('channel_view')).toHaveClass('channel-view', 'direct-messages-controller');

        unmount();

        expect(document.body).not.toHaveClass('channel-view');
    });
});
