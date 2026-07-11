// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {IuinReadmeFile, IuinReadmeWorkspace} from './profile_data';
import {
    IUIN_README_MAIN_FILE,
    getReadmeRelativePath,
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
});
