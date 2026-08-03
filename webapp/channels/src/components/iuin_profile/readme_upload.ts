// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {IuinReadmeFile, IuinReadmeWorkspace} from './profile_data';

export const MAX_IUIN_README_UPLOAD_SIZE = 5 * 1024 * 1024;
export const MAX_IUIN_README_WORKSPACE_SIZE = 50 * 1024 * 1024;

export const IUIN_README_REMOTE_TIMEOUT_MS = 15 * 1000;
const TEXT_FILE_PATTERN = /\.(c|cc|conf|cpp|css|csv|go|h|hpp|html?|ini|java|js|jsx|json|log|md|markdown|properties|py|rb|rs|rst|sh|sql|toml|ts|tsx|txt|xml|ya?ml)$/i;
const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const TEXT_MIME_PATTERN = /^(application\/(javascript|json|sql|xml|x-httpd-php|x-sh|x-yaml)|text\/)/i;

export async function createIuinReadmeFileFromUpload(file: File, path: string): Promise<IuinReadmeFile> {
    if (file.size > MAX_IUIN_README_UPLOAD_SIZE) {
        throw new Error(`Files must be smaller than ${MAX_IUIN_README_UPLOAD_SIZE / (1024 * 1024)} MB.`);
    }

    const type = getIuinReadmeUploadType(file, path);
    const content = type === 'asset' ? await readFileAsDataUrl(file) : await readFileAsText(file);

    return {
        path,
        content,
        type,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        updatedAt: Date.now(),
    };
}

export async function fetchIuinReadmeRemote(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), IUIN_README_REMOTE_TIMEOUT_MS);

    try {
        return await fetch(url, {...init, signal: controller.signal});
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error('Remote request timed out.');
        }
        throw error;
    } finally {
        globalThis.clearTimeout(timeoutId);
    }
}

export async function createIuinReadmeFileFromRemoteUrl(url: string, path: string): Promise<IuinReadmeFile> {
    const response = await fetchIuinReadmeRemote(url);
    if (!response.ok) {
        throw new Error(`Could not download ${path}.`);
    }

    const blob = await response.blob();
    const name = path.split('/').pop() || 'asset';

    return createIuinReadmeFileFromUpload(new File([blob], name, {type: blob.type}), path);
}

export function getIuinReadmeWorkspaceSize(workspace: IuinReadmeWorkspace): number {
    return workspace.files.reduce((total, file) => {
        if (file.type === 'folder') {
            return total;
        }
        if (file.type === 'asset' && typeof file.sizeBytes === 'number') {
            return total + file.sizeBytes;
        }
        return total + new Blob([file.content]).size;
    }, 0);
}

export function getIuinReadmeUploadType(file: File, path: string): IuinReadmeFile['type'] {
    if (MARKDOWN_FILE_PATTERN.test(path)) {
        return 'markdown';
    }

    const text = !isIuinReadmeImageFile({path, mimeType: file.type}) && (TEXT_MIME_PATTERN.test(file.type) || TEXT_FILE_PATTERN.test(path));
    if (text) {
        return 'text';
    }

    return 'asset';
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
