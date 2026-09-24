// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {Locations} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import PostOptions from './post_options';

jest.mock('components/common/hooks/usePluginVisibilityInSharedChannel', () => ({
    usePluginVisibilityInSharedChannel: () => true,
}));
jest.mock('components/dot_menu', () => () => <button data-testid='dot-menu'/>);
jest.mock('./add_iuin_sticker_favorite_button', () => () => <button data-testid='favorite-iuin-emoji'/>);

describe('PostOptions', () => {
    test('shows the normal message menu for an IUIN emoji post', () => {
        const post = TestHelper.getPostMock({
            id: 'post-id',
            channel_id: 'channel-id',
            user_id: 'current-user',
            message: '',
            type: '',
            root_id: '',
            props: {
                iuin_emoji_id: 'emoji-id',
            },
        });

        renderWithContext(
            <PostOptions
                post={post}
                teamId='team-id'
                removePost={jest.fn()}
                handleDropdownOpened={jest.fn()}
                collapsedThreadsEnabled={false}
                shouldShowActionsMenu={false}
                oneClickReactionsEnabled={false}
                recentEmojis={[]}
                hover={true}
                isMobileView={false}
                canReply={true}
                location={Locations.CENTER}
                canDelete={true}
                pluginActions={[]}
                isChannelAutotranslated={false}
                actions={{emitShortcutReactToLastPostFrom: jest.fn()}}
            />,
        );

        expect(screen.getByTestId('favorite-iuin-emoji')).toBeInTheDocument();
        expect(screen.getByTestId('dot-menu')).toBeInTheDocument();
    });
});
