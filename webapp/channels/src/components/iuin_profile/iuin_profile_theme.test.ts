// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'fs';
import path from 'path';

const stylesheet = fs.readFileSync(path.join(__dirname, 'iuin_profile.scss'), 'utf8');
const themeContractMarker = '/* IUIN active theme contract. */';

describe('IUIN active theme contract', () => {
    test('binds every standalone IUIN surface to Mattermost theme tokens', () => {
        const contractStart = stylesheet.indexOf(themeContractMarker);

        expect(contractStart).toBeGreaterThanOrEqual(0);

        const contract = stylesheet.slice(contractStart);
        const standaloneRoots = [
            '.iuin-profile-display',
            '.iuin-readme-workbench',
            '.iuin-profile-entry-dialog',
            '.iuin-profile-widget-dialog',
            '.iuin-profile-avatar-crop-dialog',
            '.iuin-profile-achievement-detail',
        ];

        standaloneRoots.forEach((selector) => expect(contract).toContain(selector));
        expect(contract).toContain('--iuin-theme-bg: var(--center-channel-bg);');
        expect(contract).toContain('--iuin-theme-text: var(--center-channel-color);');
        expect(contract).toContain('--iuin-theme-accent: var(--button-bg, #1c58d9);');
        expect(contract).toContain('--iuin-theme-accent-text: var(--button-color, #fff);');
    });

    test('themes the avatar actions and editor dialog surfaces', () => {
        const contract = stylesheet.slice(stylesheet.indexOf(themeContractMarker));

        [
            '.iuin-profile-avatar-upload',
            '.iuin-profile-avatar-status',
            '.iuin-profile-research-fields-edit',
            '.iuin-profile-fields-dialog',
            '.iuin-profile-honor-dialog',
            '.iuin-profile-avatar-manager',
            '.iuin-profile-widget-dialog',
        ].forEach((selector) => expect(contract).toContain(selector));

        expect(contract).toContain('.iuin-readme-workbench__sidebar-panel--github .iuin-readme-workbench__github-inline input');
        expect(contract).toContain('.iuin-readme-workbench__source .iuin-profile-editor__code-editor');
        expect(contract).toContain('background: var(--iuin-theme-bg);');
        expect(contract).toContain('color: var(--iuin-theme-text);');
        expect(contract).toContain('border-color: var(--iuin-theme-border);');
    });
});
