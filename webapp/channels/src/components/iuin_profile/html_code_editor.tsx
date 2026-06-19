// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

type Props = {
    value: string;
    onChange: (value: string) => void;
};

export default function HtmlCodeEditor({value, onChange}: Props) {
    const lineNumbersRef = React.useRef<HTMLPreElement | null>(null);
    const lineNumbers = React.useMemo(() => {
        const lineCount = Math.max(value.split('\n').length, 1);

        return Array.from({length: lineCount}, (_line, index) => index + 1).join('\n');
    }, [value]);

    const handleScroll = React.useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
        }
    }, []);

    return (
        <div className='iuin-profile-editor__code-editor-shell'>
            <pre
                ref={lineNumbersRef}
                className='iuin-profile-editor__code-line-numbers'
                aria-hidden='true'
            >
                {lineNumbers}
            </pre>
            <textarea
                className='iuin-profile-editor__code-editor'
                spellCheck={false}
                value={value}
                onScroll={handleScroll}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}
