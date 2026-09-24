// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'fs';
import path from 'path';

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

    describe('narrow-screen breakpoint', () => {
        test('should judge 1020px as narrow and leave 1021px to the wide shell', () => {
            render(<MobileViewWatcher {...baseProps}/>);

            const queries = matchMedia.getMediaQueries();
            const narrowQuery = queries.find((query) => query.startsWith('(max-width'));

            // The agreed boundary: the narrow judgement is inclusive at 1020px.
            expect(Constants.MOBILE_SCREEN_WIDTH).toBe(1020);
            expect(narrowQuery).toBe(`(max-width: ${Constants.MOBILE_SCREEN_WIDTH}px)`);

            // One pixel above it is the lower bound the wide shell branches ask about, so the
            // two judgements meet without a gap or an overlap.
            expect(queries.find((query) => query.startsWith(`(min-width: ${Constants.MOBILE_SCREEN_WIDTH + 1}px)`))).toBeDefined();
        });

        test('should take the narrow boundary in the shell stylesheets from the same number', () => {
            // Only the shell boundary is covered: component-owned breakpoints keep their own
            // values (KTD3), and the global header carries one of its own.
            const read = (stylesheet: string) => fs.readFileSync(path.join(__dirname, '../../', stylesheet), 'utf8').replace(/^\s*\/\/.*$/gm, '');

            const narrowStylesheets = [
                'sass/responsive/_mobile.scss',
                'sass/responsive/_tablet.scss',
                'sass/base/_structure.scss',
                'sass/layout/_sidebar-right.scss',
                'components/app_bar/app_bar.scss',
            ];
            const wideStylesheets = [
                'sass/responsive/_tablet.scss',
                'sass/base/_structure.scss',
                'sass/layout/_sidebar-left.scss',
                'sass/layout/_sidebar-right.scss',
                'sass/layout/_team-sidebar.scss',
            ];
            const shellStylesheets = [...new Set([...narrowStylesheets, ...wideStylesheets])];

            // Every collapsing shell stylesheet names the boundary, and names the same one.
            narrowStylesheets.forEach((stylesheet) => {
                expect(read(stylesheet)).toContain(`(max-width: ${Constants.MOBILE_SCREEN_WIDTH}px)`);
            });
            wideStylesheets.forEach((stylesheet) => {
                expect(read(stylesheet)).toContain(`(min-width: ${Constants.MOBILE_SCREEN_WIDTH + 1}px)`);
            });

            // No second boundary competes with it anywhere in those stylesheets.
            const boundaries = shellStylesheets.flatMap((stylesheet) => {
                const queries = read(stylesheet).match(/@media[^{]*/g) ?? [];
                return queries.flatMap((query) => [...query.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)]).
                    map((match) => Number(match[2])).
                    filter((width) => width > 1000 && width < 1100);
            });

            expect([...new Set(boundaries)].sort((a, b) => a - b)).toEqual([Constants.MOBILE_SCREEN_WIDTH, Constants.MOBILE_SCREEN_WIDTH + 1]);
        });
    });
});
