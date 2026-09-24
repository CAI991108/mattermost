// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {SystemEmoji} from '@mattermost/types/emojis';

import {fireEvent, renderWithContext, screen, waitFor} from 'tests/react_testing_utils';
import EmojiMap from 'utils/emoji_map';
import {deleteIuinEmoji, listIuinEmojis, listIuinRecentEmojis} from 'utils/iuin_emojis';

import EmojiPicker from './emoji_picker';

jest.mock('utils/iuin_emojis');

jest.mock('components/emoji_picker/components/emoji_picker_skin', () => () => (
    <div/>
));
jest.mock('components/emoji_picker/components/emoji_picker_preview', () => ({emoji}: {emoji?: SystemEmoji}) => (
    <div className='emoji-picker__preview'>{`Preview for ${emoji?.short_name} emoji`}</div>
));

describe('components/emoji_picker/EmojiPicker', () => {
    const mockedDeleteIuinEmoji = jest.mocked(deleteIuinEmoji);
    const mockedListIuinEmojis = jest.mocked(listIuinEmojis);
    const mockedListIuinRecentEmojis = jest.mocked(listIuinRecentEmojis);

    const baseProps = {
        filter: '',
        visible: true,
        onEmojiClick: jest.fn(),
        handleFilterChange: jest.fn(),
        handleEmojiPickerClose: jest.fn(),
        customEmojisEnabled: false,
        currentUserId: 'current-user',
        customEmojiPage: 1,
        emojiMap: new EmojiMap(new Map()),
        recentEmojis: [],
        userSkinTone: 'default',
        actions: {
            getCustomEmojis: jest.fn(),
            incrementEmojiPickerPage: jest.fn(),
            loadCustomEmojisIfNeeded: jest.fn(),
            searchCustomEmojis: jest.fn(),
            setUserSkinTone: jest.fn(),
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockedDeleteIuinEmoji.mockResolvedValue();
        mockedListIuinEmojis.mockResolvedValue([]);
        mockedListIuinRecentEmojis.mockResolvedValue([]);
    });

    test('should match snapshot', () => {
        const {asFragment} = renderWithContext(
            <EmojiPicker {...baseProps}/>,
        );

        expect(asFragment()).toMatchSnapshot();
    });

    test('Recent category should not exist if there are no recent emojis', () => {
        renderWithContext(
            <EmojiPicker {...baseProps}/>,
        );

        expect(screen.queryByLabelText('Recent')).toBeNull();
    });

    test('Legacy recent category should stay hidden when there are recent emojis', () => {
        const props = {
            ...baseProps,
            recentEmojis: ['smile'],
        };

        renderWithContext(
            <EmojiPicker {...props}/>,
        );

        expect(screen.queryByLabelText('Recently Used')).toBeNull();
    });

    test('First emoji should be selected on search', () => {
        const props = {
            ...baseProps,
            filter: 'wave',
        };

        renderWithContext(
            <EmojiPicker {...props}/>,
        );

        expect(screen.queryByText('Preview for wave emoji')).not.toBeNull();
    });

    test('Categories should be hidden when filter has text', () => {
        const props = {
            ...baseProps,
            filter: 'smile',
        };

        renderWithContext(
            <EmojiPicker {...props}/>,
        );

        expect(screen.queryByTestId('emojiPickerCategories')).toBeNull();
    });

    test('Categories should be visible when filter is empty', () => {
        const props = {
            ...baseProps,
            filter: '',
        };

        renderWithContext(
            <EmojiPicker {...props}/>,
        );

        expect(screen.queryByTestId('emojiPickerCategories')).not.toBeNull();
    });

    test('shows delete on right click only for an emoji created by the current user', async () => {
        mockedListIuinEmojis.mockResolvedValue([
            {
                id: 'mine',
                name: 'mine',
                creatorUserId: 'current-user',
                filename: 'mine.png',
                mimeType: 'image/png',
                sizeBytes: 1,
                width: 32,
                height: 32,
                sha256: 'mine',
                imageUrl: '/mine.png',
                createdAt: 1,
                updatedAt: 1,
                libraryAt: 1,
            },
            {
                id: 'theirs',
                name: 'theirs',
                creatorUserId: 'other-user',
                filename: 'theirs.png',
                mimeType: 'image/png',
                sizeBytes: 1,
                width: 32,
                height: 32,
                sha256: 'theirs',
                imageUrl: '/theirs.png',
                createdAt: 1,
                updatedAt: 1,
                libraryAt: 1,
            },
        ]);

        renderWithContext(
            <EmojiPicker
                {...baseProps}
                enableIuinEmojiLibrary={true}
            />,
        );

        fireEvent.contextMenu(await screen.findByTitle('theirs.png'));
        expect(screen.queryByRole('button', {name: 'Delete'})).not.toBeInTheDocument();

        fireEvent.contextMenu(screen.getByTitle('mine.png'));
        expect(screen.getByRole('button', {name: 'Delete'})).toBeInTheDocument();
    });

    test('deletes an owned emoji from the library', async () => {
        mockedListIuinEmojis.mockResolvedValue([{
            id: 'mine',
            name: 'mine',
            creatorUserId: 'current-user',
            filename: 'mine.png',
            mimeType: 'image/png',
            sizeBytes: 1,
            width: 32,
            height: 32,
            sha256: 'mine',
            imageUrl: '/mine.png',
            createdAt: 1,
            updatedAt: 1,
            libraryAt: 1,
        }]);

        renderWithContext(
            <EmojiPicker
                {...baseProps}
                enableIuinEmojiLibrary={true}
            />,
        );
        fireEvent.contextMenu(await screen.findByTitle('mine.png'));
        fireEvent.click(screen.getByRole('button', {name: 'Delete'}));

        await waitFor(() => expect(mockedDeleteIuinEmoji).toHaveBeenCalledWith('mine'));
        await waitFor(() => expect(screen.queryByTitle('mine.png')).not.toBeInTheDocument());
    });
});
