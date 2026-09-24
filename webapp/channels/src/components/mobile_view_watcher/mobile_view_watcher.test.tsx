// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import React from 'react';

import matchMedia from 'tests/helpers/match_media.mock';
import Constants, {WindowSizes} from 'utils/constants';

import MobileViewWatcher from './mobile_view_watcher';

describe('window.matchMedia', () => {
    const baseProps = {
        emitBrowserWindowResized: jest.fn(),
        closeRightHandSide: jest.fn(),
    };

    const mobileQuery = `(max-width: ${Constants.MOBILE_SCREEN_WIDTH}px)`;
    const smallDesktopQuery = `(min-width: ${Constants.TABLET_SCREEN_WIDTH + 1}px) and (max-width: ${Constants.DESKTOP_SCREEN_WIDTH}px)`;

    afterEach(() => {
        matchMedia.clear();
    });

    test('should update redux when the desktop media query matches', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(0);

        matchMedia.useMediaQuery(`(min-width: ${Constants.DESKTOP_SCREEN_WIDTH + 1}px)`);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(1);

        expect(baseProps.emitBrowserWindowResized.mock.calls[0][0]).toBe(WindowSizes.DESKTOP_VIEW);
    });

    test('should update redux when the small desktop media query matches', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(0);

        matchMedia.useMediaQuery(`(min-width: ${Constants.TABLET_SCREEN_WIDTH + 1}px) and (max-width: ${Constants.DESKTOP_SCREEN_WIDTH}px)`);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(1);

        expect(baseProps.emitBrowserWindowResized.mock.calls[0][0]).toBe(WindowSizes.SMALL_DESKTOP_VIEW);
    });

    test('should update redux when the tablet media query matches', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(0);

        matchMedia.useMediaQuery(`(min-width: ${Constants.MOBILE_SCREEN_WIDTH + 1}px) and (max-width: ${Constants.TABLET_SCREEN_WIDTH}px)`);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(1);

        expect(baseProps.emitBrowserWindowResized.mock.calls[0][0]).toBe(WindowSizes.TABLET_VIEW);
    });

    test('should update redux when the mobile media query matches', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(0);

        matchMedia.useMediaQuery(`(max-width: ${Constants.MOBILE_SCREEN_WIDTH}px)`);

        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(1);

        expect(baseProps.emitBrowserWindowResized.mock.calls[0][0]).toBe(WindowSizes.MOBILE_VIEW);
    });

    test('should not close the right-hand panel on the first measurement', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        matchMedia.useMediaQuery(mobileQuery);

        expect(baseProps.closeRightHandSide).not.toHaveBeenCalled();
    });

    test('should close the right-hand panel when the window crosses into the narrow shell', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        matchMedia.useMediaQuery(smallDesktopQuery);
        expect(baseProps.closeRightHandSide).not.toHaveBeenCalled();

        matchMedia.useMediaQuery(mobileQuery);

        expect(baseProps.closeRightHandSide).toHaveBeenCalledTimes(1);
        expect(baseProps.emitBrowserWindowResized.mock.calls[1][0]).toBe(WindowSizes.MOBILE_VIEW);
    });

    test('should close the right-hand panel when the window crosses back out of the narrow shell', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        matchMedia.useMediaQuery(mobileQuery);
        expect(baseProps.closeRightHandSide).not.toHaveBeenCalled();

        matchMedia.useMediaQuery(smallDesktopQuery);

        expect(baseProps.closeRightHandSide).toHaveBeenCalledTimes(1);
        expect(baseProps.emitBrowserWindowResized.mock.calls[1][0]).toBe(WindowSizes.SMALL_DESKTOP_VIEW);
    });

    test('should not touch the right-hand panel when the window changes size within one shell', () => {
        render(<MobileViewWatcher {...baseProps}/>);

        matchMedia.useMediaQuery(smallDesktopQuery);
        matchMedia.useMediaQuery(`(min-width: ${Constants.DESKTOP_SCREEN_WIDTH + 1}px)`);

        // Both sizes belong to the wide shell, so the panel state carries over.
        expect(baseProps.closeRightHandSide).not.toHaveBeenCalled();
        expect(baseProps.emitBrowserWindowResized).toHaveBeenCalledTimes(2);
    });
});
