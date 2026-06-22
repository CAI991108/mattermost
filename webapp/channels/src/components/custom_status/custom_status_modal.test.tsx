// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {DeepPartial} from '@mattermost/types/utilities';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

import type {GlobalState} from 'types/store';

import CustomStatusModal from './custom_status_modal';

jest.mock('images/img_trans.gif', () => 'img_trans.gif');

describe('CustomStatusModal', () => {
    const baseProps = {
        onExited: jest.fn(),
    };

    const initialState: DeepPartial<GlobalState> = {
        entities: {
            general: {
                config: {
                    EnableCustomEmoji: 'true',
                    EnableCustomUserStatuses: 'true',
                },
            },
        },
    };

    test('should render GitHub-style status controls', () => {
        renderWithContext(
            <CustomStatusModal
                {...baseProps}
            />,
            initialState,
        );

        expect(screen.getByText('Edit status')).toBeInTheDocument();
        expect(screen.getByLabelText("What's happening")).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Upload status image/})).toBeInTheDocument();
        expect(document.querySelector('.StatusModal__image-input')).toHaveAttribute('hidden');
        expect(screen.getByText('80 characters remaining')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /On vacation/})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Out sick/})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Working from home/})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Focusing/})).toBeInTheDocument();
        expect(screen.queryByLabelText(/Busy/)).not.toBeInTheDocument();
        expect(screen.queryByText('Expiration')).not.toBeInTheDocument();
        expect(screen.queryByText('Visible to')).not.toBeInTheDocument();
        expect(screen.getByText('Clear status')).toBeInTheDocument();
        expect(screen.getByText('Set status')).toBeInTheDocument();
    });

    test('should update remaining characters as the user types', async () => {
        renderWithContext(
            <CustomStatusModal
                {...baseProps}
            />,
            initialState,
        );

        await userEvent.type(screen.getByLabelText("What's happening"), 'Focusing');

        expect(screen.getByText('72 characters remaining')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /On vacation/})).toBeInTheDocument();
    });

    test('should populate the status from a suggestion chip', async () => {
        renderWithContext(
            <CustomStatusModal
                {...baseProps}
            />,
            initialState,
        );

        await userEvent.click(screen.getByRole('button', {name: /Focusing/}));

        expect(screen.getByLabelText("What's happening")).toHaveValue('Focusing');
        expect(screen.getByText('72 characters remaining')).toBeInTheDocument();
    });
});
