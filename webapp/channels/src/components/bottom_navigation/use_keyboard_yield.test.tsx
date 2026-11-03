// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, renderHook} from '@testing-library/react';

import useKeyboardYield from './use_keyboard_yield';

type Listener = () => void;

describe('useKeyboardYield', () => {
    let resizeListeners: Listener[];
    let viewportHeight: number;

    const setViewportHeight = (height: number) => {
        viewportHeight = height;
        act(() => {
            resizeListeners.forEach((listener) => listener());
        });
    };

    beforeEach(() => {
        resizeListeners = [];
        viewportHeight = window.innerHeight;

        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: {
                get height() {
                    return viewportHeight;
                },
                offsetTop: 0,
                addEventListener: (type: string, listener: Listener) => {
                    if (type === 'resize') {
                        resizeListeners.push(listener);
                    }
                },
                removeEventListener: (type: string, listener: Listener) => {
                    resizeListeners = resizeListeners.filter((existing) => existing !== listener);
                },
            },
        });
    });

    afterEach(() => {
        delete (window as unknown as {visualViewport?: unknown}).visualViewport;
        document.body.innerHTML = '';
    });

    const renderEditable = (tagName: 'input' | 'div') => {
        const element = document.createElement(tagName);
        if (tagName === 'div') {
            element.setAttribute('contenteditable', 'true');
        }
        document.body.appendChild(element);
        fireEvent.focusIn(element);
    };

    test('stays put while nothing editable is focused', () => {
        const {result} = renderHook(() => useKeyboardYield());

        setViewportHeight(window.innerHeight - 300);

        expect(result.current).toBe(false);
    });

    test('yields while the composer is focused and the viewport is compressed', () => {
        const {result} = renderHook(() => useKeyboardYield());

        act(() => {
            renderEditable('div');
        });
        setViewportHeight(window.innerHeight - 300);

        expect(result.current).toBe(true);
    });

    test('yields for a plain input too, not only for the composer', () => {
        const {result} = renderHook(() => useKeyboardYield());

        act(() => {
            renderEditable('input');
        });
        setViewportHeight(window.innerHeight - 300);

        expect(result.current).toBe(true);
    });

    test('does not yield when focus is lost', () => {
        const {result} = renderHook(() => useKeyboardYield());

        act(() => {
            renderEditable('input');
        });
        setViewportHeight(window.innerHeight - 300);
        expect(result.current).toBe(true);

        act(() => {
            fireEvent.focusOut(document.body);
        });

        expect(result.current).toBe(false);
    });

    test('does not yield when the viewport is only slightly compressed', () => {
        const {result} = renderHook(() => useKeyboardYield());

        act(() => {
            renderEditable('input');
        });
        setViewportHeight(window.innerHeight - 40);

        expect(result.current).toBe(false);
    });
});
