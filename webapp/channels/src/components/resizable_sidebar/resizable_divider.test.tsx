// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useRef} from 'react';

import {emitBrowserWindowResized} from 'actions/views/browser';

import {act, fireEvent, renderWithContext, screen} from 'tests/react_testing_utils';
import {WindowSizes} from 'utils/constants';

import type {GlobalState} from 'types/store';

import {CssVarKeyForResizable, ResizeDirection} from './constants';
import ResizableDivider from './resizable_divider';

const STORAGE_KEY = 'resizable_testResizeHandle:user-id';

function TestHarness({onResizeEnd}: {onResizeEnd: jest.Mock}) {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div
            ref={containerRef}
            data-testid='resizableTestContainer'
        >
            <ResizableDivider
                id='resizableTestDivider'
                name='testResizeHandle'
                globalCssVar={CssVarKeyForResizable.RHS}
                defaultWidth={400}
                dir={ResizeDirection.RIGHT}
                containerRef={containerRef}
                onResizeEnd={onResizeEnd}
            />
        </div>
    );
}

function stateWithWindowSize(windowSize: string) {
    return {
        entities: {
            general: {config: {}},
            preferences: {myPreferences: {}},
            users: {currentUserId: 'user-id', profiles: {}},
            teams: {currentTeamId: 'team-id', teams: {}, myMembers: {}},
        },
        storage: {storage: {}, initialized: true},
        views: {browser: {windowSize, focused: true}},
    };
}

function mockContainerWidth(container: HTMLElement, width: number) {
    container.getBoundingClientRect = jest.fn(() => ({
        width,
        height: 600,
        top: 0,
        left: 0,
        right: width,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    })) as unknown as typeof container.getBoundingClientRect;
}

function getStoredWidth(store: {getState: () => GlobalState}) {
    const storedItem = store.getState().storage?.storage?.[STORAGE_KEY];

    return storedItem?.value;
}

describe('components/resizable_sidebar/resizable_divider', () => {
    afterEach(() => {
        document.body.classList.remove('layout-changing');
    });

    test('should not render the drag handle in the narrow shell, and render it in the wide shell', () => {
        const narrow = renderWithContext(
            <TestHarness onResizeEnd={jest.fn()}/>,
            stateWithWindowSize(WindowSizes.MOBILE_VIEW),
        );
        expect(narrow.container.querySelector('#resizableTestDivider')).toBeNull();
        narrow.unmount();

        renderWithContext(
            <TestHarness onResizeEnd={jest.fn()}/>,
            stateWithWindowSize(WindowSizes.SMALL_DESKTOP_VIEW),
        );
        expect(document.getElementById('resizableTestDivider')).not.toBeNull();
    });

    test('should cancel an in-progress drag when the window crosses into the narrow shell', () => {
        const onResizeEnd = jest.fn();
        const {store} = renderWithContext(
            <TestHarness onResizeEnd={onResizeEnd}/>,
            stateWithWindowSize(WindowSizes.SMALL_DESKTOP_VIEW),
        );

        const container = screen.getByTestId('resizableTestContainer');
        mockContainerWidth(container, 400);

        fireEvent.mouseDown(document.getElementById('resizableTestDivider')!);

        expect(document.body).toHaveClass('layout-changing');
        expect(container.style.getPropertyValue(`--${CssVarKeyForResizable.RHS}`)).toBe('400px');

        act(() => {
            store.dispatch(emitBrowserWindowResized(WindowSizes.MOBILE_VIEW));
        });

        expect(document.body).not.toHaveClass('layout-changing');
        expect(container.style.getPropertyValue(`--${CssVarKeyForResizable.RHS}`)).toBe('');

        // The divider is not rendered in the narrow shell any more
        expect(document.getElementById('resizableTestDivider')).toBeNull();

        // The interrupted width is dropped instead of persisted, so the wide shell
        // falls back to the default width
        expect(getStoredWidth(store)).toBeUndefined();

        // The parent clears its own width override
        expect(onResizeEnd).toHaveBeenCalledTimes(1);
    });

    test('should keep the dragged width when the drag completes', () => {
        const onResizeEnd = jest.fn();
        const {store} = renderWithContext(
            <TestHarness onResizeEnd={onResizeEnd}/>,
            stateWithWindowSize(WindowSizes.SMALL_DESKTOP_VIEW),
        );

        const container = screen.getByTestId('resizableTestContainer');
        mockContainerWidth(container, 400);

        fireEvent.mouseDown(document.getElementById('resizableTestDivider')!);
        fireEvent.mouseUp(window);

        expect(getStoredWidth(store)).toBe(400);
        expect(document.body).not.toHaveClass('layout-changing');
    });

    test('should only clean up once across repeated crossings', () => {
        const onResizeEnd = jest.fn();
        const {store} = renderWithContext(
            <TestHarness onResizeEnd={onResizeEnd}/>,
            stateWithWindowSize(WindowSizes.SMALL_DESKTOP_VIEW),
        );

        const container = screen.getByTestId('resizableTestContainer');
        mockContainerWidth(container, 400);

        fireEvent.mouseDown(document.getElementById('resizableTestDivider')!);

        act(() => {
            store.dispatch(emitBrowserWindowResized(WindowSizes.MOBILE_VIEW));
        });
        act(() => {
            store.dispatch(emitBrowserWindowResized(WindowSizes.SMALL_DESKTOP_VIEW));
        });
        act(() => {
            store.dispatch(emitBrowserWindowResized(WindowSizes.MOBILE_VIEW));
        });

        expect(onResizeEnd).toHaveBeenCalledTimes(1);
        expect(document.body).not.toHaveClass('layout-changing');
        expect(container.style.getPropertyValue(`--${CssVarKeyForResizable.RHS}`)).toBe('');
        expect(getStoredWidth(store)).toBeUndefined();
    });

    test('should not run any cleanup when no drag is in progress', () => {
        const onResizeEnd = jest.fn();
        const {store} = renderWithContext(
            <TestHarness onResizeEnd={onResizeEnd}/>,
            stateWithWindowSize(WindowSizes.MOBILE_VIEW),
        );

        act(() => {
            store.dispatch(emitBrowserWindowResized(WindowSizes.SMALL_DESKTOP_VIEW));
        });

        expect(onResizeEnd).not.toHaveBeenCalled();
        expect(document.body).not.toHaveClass('layout-changing');
    });
});
