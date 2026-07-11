// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {IuinReadmeFile} from './profile_data';

export const MAX_IUIN_README_UPLOAD_SIZE = 25 * 1024 * 1024;

const TEXT_FILE_PATTERN = /\.(c|cc|conf|cpp|css|csv|go|h|hpp|html?|ini|java|js|jsx|json|log|md|markdown|properties|py|rb|rs|rst|sh|sql|toml|ts|tsx|txt|xml|ya?ml)$/i;
const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const TEXT_MIME_PATTERN = /^(application\/(javascript|json|sql|xml|x-httpd-php|x-sh|x-yaml)|text\/)/i;

export async function createIuinReadmeFileFromUpload(file: File, path: string): Promise<IuinReadmeFile> {
    if (file.size > MAX_IUIN_README_UPLOAD_SIZE) {
        throw new Error(`Files must be smaller than ${MAX_IUIN_README_UPLOAD_SIZE / (1024 * 1024)} MB.`);
    }

    const markdown = MARKDOWN_FILE_PATTERN.test(path);
    const text = !isIuinReadmeImageFile({path, mimeType: file.type}) && (TEXT_MIME_PATTERN.test(file.type) || TEXT_FILE_PATTERN.test(path));
    const content = text ? await readFileAsText(file) : await readFileAsDataUrl(file);
    let type: IuinReadmeFile['type'] = 'asset';
    if (markdown) {
        type = 'markdown';
    } else if (text) {
        type = 'text';
    }

    return {
        path,
        content,
        type,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        updatedAt: Date.now(),
    };
}

export function isIuinReadmeImageFile(file: Pick<IuinReadmeFile, 'path' | 'mimeType'>): boolean {
    return Boolean(file.mimeType?.startsWith('image/') || IMAGE_FILE_PATTERN.test(file.path));
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsText(file);
    });
}
