// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext} from 'tests/react_testing_utils';

import ListItem from './list_item';
import type {Props} from './list_item';

import type {OptionValue} from '../types';

const state = {
    entities: {
        users: {
            currentUserId: 'currentUserId',
            statuses: {
                user_id_1: 'online',
            },
        },
    },
};

describe('ListItem', () => {
    const baseProps: Props = {
        isMobileView: false,
        isSelected: false,
        add: jest.fn(),
        select: jest.fn(),
        option: {} as OptionValue,
    };

    test('should match snapshot when rendering user', () => {
        const user = {
            id: 'user_id_1',
            username: 'username1',
            last_post_at: 0,
        } as OptionValue;

        const {container} = renderWithContext(
            <ListItem
                {...baseProps}
                option={user}
            />,
            state,
        );

        expect(container).toMatchSnapshot();
    });
});
