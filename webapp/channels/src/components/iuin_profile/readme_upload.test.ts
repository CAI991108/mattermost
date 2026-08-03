// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIuinReadmeFileFromRemoteUrl, createIuinReadmeFileFromUpload, getIuinReadmeWorkspaceSize, isIuinReadmeImageFile, IUIN_README_REMOTE_TIMEOUT_MS, MAX_IUIN_README_UPLOAD_SIZE, MAX_IUIN_README_WORKSPACE_SIZE} from './readme_upload';

describe('IUIN README uploads', () => {
    test('keeps Markdown and source files as editable text', async () => {
        const file = new File(['# Profile'], 'README.md', {type: 'text/markdown'});

        const uploaded = await createIuinReadmeFileFromUpload(file, 'README.md');

        expect(uploaded.type).toBe('markdown');
        expect(uploaded.content).toBe('# Profile');
        expect(uploaded.mimeType).toBe('text/markdown');
    });

    test('keeps PNG bytes as a data URL asset', async () => {
        const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'figure.png', {type: 'image/png'});

        const uploaded = await createIuinReadmeFileFromUpload(file, 'assets/figure.png');

        expect(uploaded.type).toBe('asset');
        expect(uploaded.content).toMatch(/^data:image\/png;base64,/);
        expect(isIuinReadmeImageFile(uploaded)).toBe(true);
    });

    test('accepts PNG files above the former 2 MB status-image limit', async () => {
        const file = new File([new Uint8Array((3 * 1024 * 1024) + 1)], 'large-figure.png', {type: 'image/png'});

        const uploaded = await createIuinReadmeFileFromUpload(file, 'assets/large-figure.png');

        expect(uploaded.type).toBe('asset');
        expect(uploaded.sizeBytes).toBe((3 * 1024 * 1024) + 1);
        expect(uploaded.content).toMatch(/^data:image\/png;base64,/);
    });

    test('keeps PDF and Office files as binary assets', async () => {
        const pdf = await createIuinReadmeFileFromUpload(new File(['%PDF'], 'paper.pdf', {type: 'application/pdf'}), 'paper.pdf');
        const document = await createIuinReadmeFileFromUpload(new File(['docx'], 'notes.docx', {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), 'notes.docx');

        expect(pdf.type).toBe('asset');
        expect(pdf.content).toMatch(/^data:application\/pdf;base64,/);
        expect(document.type).toBe('asset');
        expect(document.content).toContain(';base64,');
    });

    test('downloads GitHub assets into the local workspace snapshot', async () => {
        const originalFetch = global.fetch;
        const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {type: 'image/png'});
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            blob: jest.fn().mockResolvedValue(blob),
        } as unknown as Response);

        try {
            const imported = await createIuinReadmeFileFromRemoteUrl('https://raw.githubusercontent.com/member/member/main/avatar.png', 'assets/avatar.png');

            expect(imported.type).toBe('asset');
            expect(imported.content).toMatch(/^data:image\/png;base64,/);
            expect(imported.content).not.toContain('raw.githubusercontent.com');
            expect(imported.sizeBytes).toBe(4);
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('reports failed GitHub asset downloads', async () => {
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        try {
            await expect(createIuinReadmeFileFromRemoteUrl('https://raw.githubusercontent.com/member/member/main/missing.png', 'assets/missing.png')).rejects.toThrow('Could not download assets/missing.png.');
        } finally {
            global.fetch = originalFetch;
        }
    });

    test('times out remote asset downloads', async () => {
        jest.useFakeTimers();
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockImplementation((...args: Parameters<typeof fetch>) => new Promise<Response>((resolve, reject) => {
            args[1]?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
            globalThis.setTimeout(() => resolve({} as Response), IUIN_README_REMOTE_TIMEOUT_MS * 2);
        }));

        try {
            const imported = createIuinReadmeFileFromRemoteUrl('https://raw.githubusercontent.com/member/member/main/avatar.png', 'assets/avatar.png');
            jest.advanceTimersByTime(IUIN_README_REMOTE_TIMEOUT_MS);
            await expect(imported).rejects.toThrow('Remote request timed out.');
        } finally {
            global.fetch = originalFetch;
            jest.useRealTimers();
        }
    });

    test('counts cumulative workspace size at the 50 MB boundary', () => {
        const workspace = {
            rootName: 'member-member',
            activePath: 'README.md',
            files: [{
                path: 'asset-1.png',
                content: '',
                type: 'asset' as const,
                sizeBytes: MAX_IUIN_README_WORKSPACE_SIZE - 1,
            }, {
                path: 'asset-2.png',
                content: '',
                type: 'asset' as const,
                sizeBytes: 1,
            }],
        };

        expect(getIuinReadmeWorkspaceSize(workspace)).toBe(MAX_IUIN_README_WORKSPACE_SIZE);
        workspace.files[1].sizeBytes = 2;
        expect(getIuinReadmeWorkspaceSize(workspace)).toBe(MAX_IUIN_README_WORKSPACE_SIZE + 1);
    });

    test('rejects files above the per-file limit', async () => {
        const oversized = new File([new Uint8Array(MAX_IUIN_README_UPLOAD_SIZE + 1)], 'large.png', {type: 'image/png'});

        await expect(createIuinReadmeFileFromUpload(oversized, 'assets/large.png')).rejects.toThrow('5 MB');
    });
});
