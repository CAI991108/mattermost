// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useEffect, useLayoutEffect, useRef} from 'react';

import Constants, {WindowSizes} from 'utils/constants';

import type {PropsFromRedux} from './index';

type Props = PropsFromRedux;

export default function MobileViewWatcher(props: Props) {
    const desktopMediaQuery = useRef(window.matchMedia(`(min-width: ${Constants.DESKTOP_SCREEN_WIDTH + 1}px)`));
    const smallDesktopMediaQuery = useRef(window.matchMedia(`(min-width: ${Constants.TABLET_SCREEN_WIDTH + 1}px) and (max-width: ${Constants.DESKTOP_SCREEN_WIDTH}px)`));
    const tabletMediaQuery = useRef(window.matchMedia(`(min-width: ${Constants.MOBILE_SCREEN_WIDTH + 1}px) and (max-width: ${Constants.TABLET_SCREEN_WIDTH}px)`));
    const mobileMediaQuery = useRef(window.matchMedia(`(max-width: ${Constants.MOBILE_SCREEN_WIDTH}px)`));

    const previousIsMobileView = useRef<boolean | null>(null);

    const updateWindowSize = useCallback(() => {
        let windowSize;
        if (desktopMediaQuery.current.matches) {
            windowSize = WindowSizes.DESKTOP_VIEW;
        } else if (smallDesktopMediaQuery.current.matches) {
            windowSize = WindowSizes.SMALL_DESKTOP_VIEW;
        } else if (tabletMediaQuery.current.matches) {
            windowSize = WindowSizes.TABLET_VIEW;
        } else if (mobileMediaQuery.current.matches) {
            windowSize = WindowSizes.MOBILE_VIEW;
        }

        if (!windowSize) {
            return;
        }

        // Crossing the narrow-screen threshold closes the right-hand panel: it is a
        // full-width overlay below the threshold and a docked column above it, so the
        // open state of one presentation cannot carry into the other (KTD5, R9).
        // A single crossing writes once: the media query ranges do not overlap, and the
        // change handler only reacts to queries that started matching.
        const isMobileView = windowSize === WindowSizes.MOBILE_VIEW;
        if (previousIsMobileView.current !== null && previousIsMobileView.current !== isMobileView) {
            props.closeRightHandSide();
        }
        previousIsMobileView.current = isMobileView;

        props.emitBrowserWindowResized(windowSize);
    }, [props.emitBrowserWindowResized, props.closeRightHandSide]);

    useLayoutEffect(() => {
        updateWindowSize();
    }, [updateWindowSize]);

    useEffect(() => {
        const handleMediaQueryChangeEvent = (e: MediaQueryListEvent) => {
            if (e.matches) {
                updateWindowSize();
            }
        };

        desktopMediaQuery.current.addEventListener('change', handleMediaQueryChangeEvent);
        smallDesktopMediaQuery.current.addEventListener('change', handleMediaQueryChangeEvent);
        tabletMediaQuery.current.addEventListener('change', handleMediaQueryChangeEvent);
        mobileMediaQuery.current.addEventListener('change', handleMediaQueryChangeEvent);

        return () => {
            desktopMediaQuery.current.removeEventListener('change', handleMediaQueryChangeEvent);
            smallDesktopMediaQuery.current.removeEventListener('change', handleMediaQueryChangeEvent);
            tabletMediaQuery.current.removeEventListener('change', handleMediaQueryChangeEvent);
            mobileMediaQuery.current.removeEventListener('change', handleMediaQueryChangeEvent);
        };
    }, [updateWindowSize]);

    return null;
}
