// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'fs';
import path from 'path';

describe('IUIN GitHub import snapshot contract', () => {
    test('does not automatically replace local profile content with remote GitHub HTML', () => {
        const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

        expect(source).not.toContain('application/vnd.github.html');
        expect(source).not.toContain('workspace.githubRenderedHtml');
        expect(source).toContain('await pushEntry(entry, reference.workspacePath, true)');

        const saveIndex = source.indexOf('const persistedWorkspace = await saveIuinReadmeWorkspaceToBackend');
        const draftIndex = source.indexOf('setReadmeDraft(nextDraft)', saveIndex);
        expect(saveIndex).toBeGreaterThan(-1);
        expect(draftIndex).toBeGreaterThan(saveIndex);
    });
});
