// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {IuinReadmeFile, IuinReadmeWorkspace} from './profile_data';
import {
    IUIN_README_MAIN_FILE,
    getReadmeRelativePath,
    moveReadmeEntry,
    parseIuinReadmeWorkspace,
    removeReadmeFile,
    removeReadmeFolder,
    renameReadmeFolder,
    renameReadmeFile,
    serializeIuinReadmeWorkspace,
    setReadmeFileContent,
    setReadmeMainDocument,
} from './profile_data';

const markdownFile = (path: string, content = ''): IuinReadmeFile => ({
    path,
    content,
    type: 'markdown',
    updatedAt: 1,
});

const textFile = (path: string, content = ''): IuinReadmeFile => ({
    path,
    content,
    type: 'text',
    updatedAt: 1,
});

const workspace = (files: IuinReadmeFile[], activePath = IUIN_README_MAIN_FILE): IuinReadmeWorkspace => ({
    rootName: 'profile-readme',
    activePath,
    githubRenderedHtml: '<article>GitHub README</article>',
    files,
});

describe('IUIN README workspace file operations', () => {
    test('resolves supporting files relative to a nested main document', () => {
        expect(getReadmeRelativePath('docs/profile', 'docs/profile/image.png')).toBe('image.png');
        expect(getReadmeRelativePath('docs/profile', 'assets/avatar.png')).toBe('../../assets/avatar.png');
    });

    test('preserves an alternate Markdown main document without injecting README.md', () => {
        const parsed = parseIuinReadmeWorkspace(JSON.stringify(workspace([
            markdownFile('docs/home.md', '# Home'),
            textFile('notes.txt', 'Notes'),
        ], 'docs/home.md')));

        expect(parsed.activePath).toBe('docs/home.md');
        expect(parsed.files.map((file) => file.path)).toEqual(['docs/home.md', 'notes.txt']);
    });

    test('editing a selected supporting file does not change the main document', () => {
        const original = workspace([
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            markdownFile('docs/details.md', '# Details'),
        ]);

        const updated = setReadmeFileContent(original, 'docs/details.md', '# Updated details', 'markdown');

        expect(updated.activePath).toBe(IUIN_README_MAIN_FILE);
        expect(updated.githubRenderedHtml).toBe(original.githubRenderedHtml);
    });

    test('sets only Markdown files as the main document', () => {
        const original = workspace([
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            markdownFile('docs/details.md', '# Details'),
            textFile('notes.txt', 'Notes'),
        ]);

        const rejected = setReadmeMainDocument(original, 'notes.txt');
        const updated = setReadmeMainDocument(original, 'docs/details.md');

        expect(rejected).toBe(original);
        expect(updated.activePath).toBe('docs/details.md');
        expect(updated.githubRenderedHtml).toBe('');
    });

    test('keeps the main document attached to a renamed file', () => {
        const original = workspace([
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            markdownFile('docs/details.md', '# Details'),
        ], 'docs/details.md');

        const updated = renameReadmeFile(original, 'docs/details.md', 'docs/profile.md');

        expect(updated.activePath).toBe('docs/profile.md');
        expect(updated.files.map((file) => file.path)).toEqual([IUIN_README_MAIN_FILE, 'docs/profile.md']);
    });

    test('falls back to another Markdown document when the main file is deleted', () => {
        const original = workspace([
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            markdownFile('docs/details.md', '# Details'),
        ], 'docs/details.md');

        const updated = removeReadmeFile(original, 'docs/details.md');

        expect(updated.activePath).toBe(IUIN_README_MAIN_FILE);
        expect(updated.files.map((file) => file.path)).toEqual([IUIN_README_MAIN_FILE]);
    });

    test('creates a safe default main document when the last Markdown file is deleted', () => {
        const original = workspace([
            markdownFile('docs/home.md', '# Home'),
            textFile('notes.txt', 'Notes'),
        ], 'docs/home.md');

        const updated = removeReadmeFile(original, 'docs/home.md');

        expect(updated.activePath).toBe(IUIN_README_MAIN_FILE);
        expect(updated.files.some((file) => file.path === IUIN_README_MAIN_FILE && file.type === 'markdown')).toBe(true);
        expect(updated.files.some((file) => file.path === 'notes.txt')).toBe(true);
    });

    test('removes nested folder contents and repairs a main document inside that folder', () => {
        const original = workspace([
            {path: 'docs', content: '', type: 'folder', updatedAt: 1},
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            markdownFile('docs/home.md', '# Home'),
            textFile('docs/notes.txt', 'Notes'),
        ], 'docs/home.md');

        const updated = removeReadmeFolder(original, 'docs');

        expect(updated.activePath).toBe(IUIN_README_MAIN_FILE);
        expect(updated.files.map((file) => file.path)).toEqual([IUIN_README_MAIN_FILE]);
    });

    test('renames nested folder contents and keeps the main document attached', () => {
        const original = workspace([
            {path: 'docs', content: '', type: 'folder', updatedAt: 1},
            markdownFile('docs/home.md', '# Home'),
            textFile('docs/notes.txt', 'Notes'),
        ], 'docs/home.md');

        const updated = renameReadmeFolder(original, 'docs', 'profile');

        expect(updated.activePath).toBe('profile/home.md');
        expect(updated.githubRenderedHtml).toBe('');
        expect(updated.files.map((file) => file.path)).toEqual(['profile', 'profile/home.md', 'profile/notes.txt']);
    });

    test('round-trips folders and the alternate main document through serialization', () => {
        const original = workspace([
            {path: 'docs', content: '', type: 'folder', updatedAt: 1},
            markdownFile('docs/home.md', '# Home'),
        ], 'docs/home.md');

        const parsed = parseIuinReadmeWorkspace(serializeIuinReadmeWorkspace(original));

        expect(parsed.activePath).toBe('docs/home.md');
        expect(parsed.files).toEqual(original.files);
    });

    test('round-trips server object references for uploaded assets', () => {
        const asset: IuinReadmeFile = {
            id: 'asset-entry-id',
            path: 'assets/figure.png',
            content: '/api/v4/users/user-id/iuin_profile/workspace/files/asset-entry-id',
            type: 'asset',
            mimeType: 'image/png',
            sizeBytes: 4,
            sha256: 'asset-sha256',
            storageKey: 'iuin_profile/users/user-id/workspaces/workspace-id/entries/asset-entry-id/original',
            updatedAt: 1,
        };
        const original = workspace([
            markdownFile(IUIN_README_MAIN_FILE, '# Main'),
            asset,
        ]);

        const parsed = parseIuinReadmeWorkspace(serializeIuinReadmeWorkspace(original));

        expect(parsed.files.find((file) => file.path === asset.path)).toEqual(asset);
    });

    test('reorders files before and after siblings', () => {
        const original = workspace([
            {...markdownFile('first.md'), sortOrder: 0},
            {...markdownFile('second.md'), sortOrder: 1},
            {...markdownFile('third.md'), sortOrder: 2},
        ], 'first.md');

        const result = moveReadmeEntry(original, 'third.md', 'first.md', 'before');

        expect(result.changed).toBe(true);
        expect(result.movedPath).toBe('third.md');
        expect(result.workspace.files.
            filter((file) => !file.path.includes('/')).
            sort((first, second) => (first.sortOrder || 0) - (second.sortOrder || 0)).
            map((file) => file.path)).toEqual(['third.md', 'first.md', 'second.md']);
    });

    test('moves a file into a folder and keeps the active document attached', () => {
        const original = workspace([
            {...markdownFile('home.md', '# Home'), sortOrder: 0},
            {path: 'docs', content: '', type: 'folder', sortOrder: 1, updatedAt: 1},
        ], 'home.md');

        const result = moveReadmeEntry(original, 'home.md', 'docs', 'inside');

        expect(result.changed).toBe(true);
        expect(result.movedPath).toBe('docs/home.md');
        expect(result.workspace.activePath).toBe('docs/home.md');
        expect(result.workspace.files.some((file) => file.path === 'docs/home.md')).toBe(true);
    });

    test('moves a folder with its descendants and rejects moving it into itself', () => {
        const original = workspace([
            {path: 'docs', content: '', type: 'folder', sortOrder: 0, updatedAt: 1},
            markdownFile('docs/home.md', '# Home'),
            {path: 'archive', content: '', type: 'folder', sortOrder: 1, updatedAt: 1},
        ], 'docs/home.md');

        const moved = moveReadmeEntry(original, 'docs', 'archive', 'inside');
        const rejected = moveReadmeEntry(original, 'docs', 'docs/home.md', 'after');

        expect(moved.movedPath).toBe('archive/docs');
        expect(moved.workspace.activePath).toBe('archive/docs/home.md');
        expect(moved.workspace.files.some((file) => file.path === 'archive/docs/home.md')).toBe(true);
        expect(rejected.changed).toBe(false);
        expect(rejected.reason).toBe('invalid');
    });
});
