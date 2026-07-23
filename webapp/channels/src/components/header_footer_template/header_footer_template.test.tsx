// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext} from 'tests/react_testing_utils';

import HeaderFooterNotLoggedIn from './header_footer_template';

describe('components/HeaderFooterTemplate', () => {
    test('should match snapshot without children', () => {
        const {container} = renderWithContext(<HeaderFooterNotLoggedIn/>);
        expect(container).toMatchSnapshot();
    });

    test('should match snapshot with children', () => {
        const {container} = renderWithContext(
            <HeaderFooterNotLoggedIn>
                <p>{'test'}</p>
            </HeaderFooterNotLoggedIn>,
        );
        expect(container).toMatchSnapshot();
    });

    test('should set classes on body and #root on mount and unset on unmount', () => {
        expect(document.body.classList.contains('sticky')).toBe(false);
        const {container, unmount} = renderWithContext(<HeaderFooterNotLoggedIn/>);
        expect(container).toMatchSnapshot();
        expect(document.body.classList.contains('sticky')).toBe(true);

        unmount();
        expect(document.body.classList.contains('sticky')).toBe(false);
        expect(container).toMatchSnapshot();
    });
});
