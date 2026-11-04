// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useRef} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import Constants from 'utils/constants';
import * as Keyboard from 'utils/keyboard';

import './narrow_views.scss';

const {KeyCodes} = Constants;

/**
 * The four sections the conversation information page carries. Members, pinned posts and files
 * are the right-hand panel's own views behind a second level selector, so their meaning matches
 * the panel's tab bar (`components/rhs_tab_bar`); the selection belongs to the page and is never
 * written back to the panel state. Settings carries the channel's own operations, which used to
 * be the header's «⋯» menu (R8, R9, R10).
 */
export type MemberSection = 'members' | 'pinned' | 'files' | 'settings';

export const MEMBER_SECTIONS: MemberSection[] = ['members', 'pinned', 'files', 'settings'];

export const MEMBER_SECTION_LABELS: Record<MemberSection, JSX.Element> = {
    members: (
        <FormattedMessage
            id='narrow_views.sections.members'
            defaultMessage='Members'
        />
    ),
    pinned: (
        <FormattedMessage
            id='narrow_views.sections.pinned'
            defaultMessage='Pinned'
        />
    ),
    files: (
        <FormattedMessage
            id='narrow_views.sections.files'
            defaultMessage='Files'
        />
    ),
    settings: (
        <FormattedMessage
            id='narrow_views.sections.settings'
            defaultMessage='Settings'
        />
    ),
};

type Props = {
    selected: MemberSection;
    onChange: (section: MemberSection) => void;
};

/**
 * The conversation information page's second level selector. It mirrors the hand written selector
 * the search results use (`components/search_results/messages_or_files_selector`): a tab list with
 * one reachable tab, selection following the arrow keys, and the same selection semantics.
 */
export default function MemberSectionsSelector({selected, onChange}: Props) {
    const {formatMessage} = useIntl();
    const tabRefs = useRef<Record<MemberSection, HTMLButtonElement | null>>({
        members: null,
        pinned: null,
        files: null,
        settings: null,
    });

    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: MemberSection) => {
        const goingRight = Keyboard.isKeyPressed(event, KeyCodes.RIGHT);
        if (!goingRight && !Keyboard.isKeyPressed(event, KeyCodes.LEFT)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const step = goingRight ? 1 : MEMBER_SECTIONS.length - 1;
        const next = MEMBER_SECTIONS[(MEMBER_SECTIONS.indexOf(current) + step) % MEMBER_SECTIONS.length];

        onChange(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <div
            className='member-sections'
            role='tablist'
            aria-label={formatMessage({
                id: 'narrow_views.sections.label',
                defaultMessage: 'Conversation info sections',
            })}
        >
            {MEMBER_SECTIONS.map((section) => {
                const isSelected = section === selected;

                return (
                    <button
                        key={section}
                        ref={(element) => {
                            tabRefs.current[section] = element;
                        }}
                        type='button'
                        role='tab'
                        id={`member-sections-tab-${section}`}
                        aria-selected={isSelected}
                        aria-controls={`member-sections-panel-${section}`}
                        tabIndex={isSelected ? 0 : -1}
                        className={classNames('member-sections__tab', {
                            'member-sections__tab--selected': isSelected,
                        })}
                        onClick={() => onChange(section)}
                        onKeyDown={(event) => handleTabKeyDown(event, section)}
                        data-testid={`memberSection-${section}`}
                    >
                        {MEMBER_SECTION_LABELS[section]}
                    </button>
                );
            })}
        </div>
    );
}
