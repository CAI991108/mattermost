// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import BrowserStore from 'stores/browser_store';

import SAILogoPng from 'images/cuhk-sai-logo01.png';
import {renderWithContext, screen} from 'utils/react_testing_utils';

import LinkingLandingPage from './linking_landing_page';

jest.mock('stores/browser_store', () => ({
    __esModule: true,
    default: {
        clearLandingPreference: jest.fn(),
        getLandingPreference: jest.fn(),
        hasSeenLandingPage: jest.fn(),
        setLandingPageSeen: jest.fn(),
    },
}));

jest.mock('images/cuhk-sai-logo01.png', () => 'cuhk-sai-logo01.png');

describe('components/linking_landing_page/LinkingLandingPage', () => {
    beforeEach(() => {
        jest.mocked(BrowserStore.hasSeenLandingPage).mockReturnValue('true');
        jest.mocked(BrowserStore.getLandingPreference).mockReturnValue('');
        window.history.replaceState(null, '', '/landing');
    });

    test('renders the SAI brand logo by default', () => {
        renderWithContext(
            <LinkingLandingPage enableCustomBrand={false}/>,
        );

        expect(screen.getByRole('img', {name: 'SAI-NET'})).toHaveAttribute('src', SAILogoPng);
    });
});
