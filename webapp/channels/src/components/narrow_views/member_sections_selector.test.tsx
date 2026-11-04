// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';

import MemberSectionsSelector from './member_sections_selector';
import type {MemberSection} from './member_sections_selector';

function ControlledSelector() {
    const [selected, setSelected] = useState<MemberSection>('members');

    return (
        <MemberSectionsSelector
            selected={selected}
            onChange={setSelected}
        />
    );
}

describe('components/narrow_views/MemberSectionsSelector', () => {
    it('marks the selected section and keeps only it reachable by tab', async () => {
        renderWithContext(<ControlledSelector/>);

        expect(screen.getByRole('tablist')).toHaveAccessibleName('Conversation info sections');
        expect(screen.getAllByRole('tab')).toHaveLength(4);

        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('tabIndex', '0');
        expect(screen.getByTestId('memberSection-pinned')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('memberSection-pinned')).toHaveAttribute('tabIndex', '-1');
        expect(screen.getByTestId('memberSection-files')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('memberSection-files')).toHaveAttribute('tabIndex', '-1');
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('tabIndex', '-1');

        await userEvent.click(screen.getByTestId('memberSection-settings'));

        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('tabIndex', '0');
        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('tabIndex', '-1');
    });

    it('points every section at the panel it controls', () => {
        renderWithContext(<ControlledSelector/>);

        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('aria-controls', 'member-sections-panel-members');
        expect(screen.getByTestId('memberSection-pinned')).toHaveAttribute('aria-controls', 'member-sections-panel-pinned');
        expect(screen.getByTestId('memberSection-files')).toHaveAttribute('aria-controls', 'member-sections-panel-files');
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('aria-controls', 'member-sections-panel-settings');
    });

    it('moves the selection and the focus with the arrow keys', async () => {
        renderWithContext(<ControlledSelector/>);

        screen.getByTestId('memberSection-members').focus();

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-pinned')).toHaveFocus();
        expect(screen.getByTestId('memberSection-pinned')).toHaveAttribute('aria-selected', 'true');

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-files')).toHaveFocus();
        expect(screen.getByTestId('memberSection-files')).toHaveAttribute('aria-selected', 'true');

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-settings')).toHaveFocus();
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('aria-selected', 'true');

        await userEvent.keyboard('{ArrowRight}');
        expect(screen.getByTestId('memberSection-members')).toHaveFocus();
        expect(screen.getByTestId('memberSection-members')).toHaveAttribute('aria-selected', 'true');

        await userEvent.keyboard('{ArrowLeft}');
        expect(screen.getByTestId('memberSection-settings')).toHaveFocus();
        expect(screen.getByTestId('memberSection-settings')).toHaveAttribute('aria-selected', 'true');
    });
});
