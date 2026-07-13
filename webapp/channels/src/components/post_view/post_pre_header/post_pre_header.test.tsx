// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import PostPreHeader from 'components/post_view/post_pre_header/post_pre_header';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

describe('components/PostPreHeader', () => {
    const baseProps = {
        channelId: 'channel_id',
        actions: {
            showPinnedPosts: jest.fn(),
        },
    };

    beforeEach(() => {
        baseProps.actions.showPinnedPosts.mockClear();
    });

    test('should not render when the post is not pinned', () => {
        const {container} = renderWithContext(
            <PostPreHeader
                {...baseProps}
                isPinned={false}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    test('should not render when pinned posts are skipped', () => {
        const {container} = renderWithContext(
            <PostPreHeader
                {...baseProps}
                isPinned={true}
                skipPinned={true}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    test('should render a pinned post and open pinned posts when clicked', async () => {
        renderWithContext(
            <PostPreHeader
                {...baseProps}
                isPinned={true}
            />,
        );

        await userEvent.click(screen.getByText('Pinned'));

        expect(baseProps.actions.showPinnedPosts).toHaveBeenCalledWith(baseProps.channelId);
    });
});
