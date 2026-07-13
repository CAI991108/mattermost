// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createIuinReadmeFileFromUpload, isIuinReadmeImageFile, MAX_IUIN_README_UPLOAD_SIZE} from './readme_upload';

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

    test('rejects files above the per-file limit', async () => {
        const oversized = new File([new Uint8Array(MAX_IUIN_README_UPLOAD_SIZE + 1)], 'large.png', {type: 'image/png'});

        await expect(createIuinReadmeFileFromUpload(oversized, 'assets/large.png')).rejects.toThrow('5 MB');
    });
});
