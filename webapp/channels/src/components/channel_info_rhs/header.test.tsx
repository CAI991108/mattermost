// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {Channel} from '@mattermost/types/channels';

import {renderWithContext, screen} from 'tests/react_testing_utils';

import Header from './header';

describe('channel_info_rhs/header', () => {
    test('renders the header title', () => {
        renderWithContext(
            <Header
                channel={{display_name: 'my channel title'} as Channel}
            />,
        );

        expect(screen.getByText('Info')).toBeInTheDocument();
        expect(screen.getByText('my channel title')).toBeInTheDocument();
    });
});
