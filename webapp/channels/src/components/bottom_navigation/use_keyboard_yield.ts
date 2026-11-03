// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';

// A compressed visual viewport of at least this many pixels is treated as an open
// on-screen keyboard rather than as browser chrome.
const KEYBOARD_MIN_OFFSET = 100;

// Anything the on-screen keyboard belongs to. The composer is a contenteditable div, and the
// member and profile search boxes are inputs, so the rule is "an editable element was focused",
// not "the composer was focused".
const EDITABLE_SELECTOR = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';

/**
 * The bottom bar yields while an editable element is focused *and* the visual viewport is
 * compressed (KTD4). Focus alone is not enough: switching channels in the narrow shell focuses
 * the composer programmatically without a keyboard, and some systems hide the keyboard without
 * ever firing a blur, so focus only makes the bar a candidate for yielding.
 */
export default function useKeyboardYield() {
    const [yielded, setYielded] = useState(false);

    useEffect(() => {
        let editableFocused = false;
        const visualViewport = window.visualViewport;

        const update = () => {
            const keyboardOffset = visualViewport ? window.innerHeight - (visualViewport.height + visualViewport.offsetTop) : 0;

            setYielded(editableFocused && keyboardOffset > KEYBOARD_MIN_OFFSET);
        };

        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            editableFocused = Boolean(target?.closest?.(EDITABLE_SELECTOR));
            update();
        };

        const handleFocusOut = () => {
            editableFocused = false;
            update();
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
        visualViewport?.addEventListener('resize', update);
        update();

        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('focusout', handleFocusOut);
            visualViewport?.removeEventListener('resize', update);
        };
    }, []);

    return yielded;
}
