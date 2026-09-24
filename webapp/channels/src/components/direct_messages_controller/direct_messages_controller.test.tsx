// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';

import DirectMessagesController from './direct_messages_controller';

jest.mock('mattermost-redux/actions/channels', () => ({
    fetchAllMyChannelMembers: () => () => new Promise(() => {}),
    fetchAllMyTeamsChannels: () => () => new Promise(() => {}),
}));

jest.mock('components/resizable_sidebar/resizable_lhs', () => {
    const ReactForMock = jest.requireActual('react');

    return function MockResizableLhs(props: {children?: React.ReactNode; className?: string}) {
        return ReactForMock.createElement(
            'div',
            {'data-testid': 'dm-lhs', className: props.className},
            props.children,
        );
    };
});
jest.mock('./direct_messages_center', () => () => <div/>);
jest.mock('./direct_messages_sidebar', () => () => <div/>);

const initialState = {
    views: {
        lhs: {
            isOpen: false,
        },
        rhs: {
            isSidebarOpen: false,
        },
        browser: {
            windowSize: WindowSizes.MOBILE_VIEW,
            focused: true,
        },
        rhsSuppressed: false,
    },
};

describe('DirectMessagesController', () => {
    beforeEach(() => {
        document.body.classList.remove('app__body', 'channel-view');
    });

    it('keeps the native full-width channel layout and body class while mounted', () => {
        const {getByTestId, unmount} = renderWithContext(
            <DirectMessagesController {...({} as any)}/>,
            initialState,
        );

        expect(document.body).toHaveClass('channel-view');
        expect(getByTestId('channel_view')).toHaveClass('channel-view');

        unmount();

        expect(document.body).not.toHaveClass('channel-view');
    });

    it('keeps the direct messages sidebar out of the way while the drawer is closed', () => {
        const {getByTestId} = renderWithContext(
            <DirectMessagesController {...({} as any)}/>,
            initialState,
        );

        expect(getByTestId('dm-lhs')).not.toHaveClass('move--right');
    });

    it('slides the direct messages sidebar in as a drawer in the narrow shell', () => {
        const {getByTestId, updateStoreState} = renderWithContext(
            <DirectMessagesController {...({} as any)}/>,
            initialState,
        );

        updateStoreState({views: {lhs: {isOpen: true}}});

        expect(getByTestId('dm-lhs')).toHaveClass('move--right');
    });

    it('keeps the drawer class off the sidebar in the wide shell', () => {
        const {getByTestId, updateStoreState} = renderWithContext(
            <DirectMessagesController {...({} as any)}/>,
            {
                views: {
                    ...initialState.views,
                    browser: {windowSize: WindowSizes.SMALL_DESKTOP_VIEW, focused: true},
                },
            },
        );

        updateStoreState({views: {lhs: {isOpen: true}}});

        expect(getByTestId('dm-lhs')).not.toHaveClass('move--right');
    });
});
