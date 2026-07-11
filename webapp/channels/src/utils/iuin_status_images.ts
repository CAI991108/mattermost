// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const IUIN_STATUS_IMAGE_TOKEN_PREFIX = 'iuin-status-image:';

export type IuinStatusImage = {
    id: string;
    token: string;
    imageUrl: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    createdAt: number;
    updatedAt: number;
};

export function getIuinStatusImageId(token?: string): string | null {
    if (!token?.startsWith(IUIN_STATUS_IMAGE_TOKEN_PREFIX)) {
        return null;
    }

    const id = token.slice(IUIN_STATUS_IMAGE_TOKEN_PREFIX.length);
    return (/^[a-zA-Z0-9]{26}$/).test(id) ? id : null;
}

export function isIuinStatusImageToken(token?: string): boolean {
    return Boolean(getIuinStatusImageId(token));
}

export function getIuinStatusImageUrl(token?: string): string {
    const id = getIuinStatusImageId(token);
    return id ? getIuinStatusImageUrlById(id) : '';
}

export function getIuinStatusImageUrlById(id?: string): string {
    return id && (/^[a-zA-Z0-9]{26}$/).test(id) ? `/api/v4/iuin/status_emojis/${id}/image` : '';
}

async function statusEmojiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<T>;
}

export function listIuinStatusImages(): Promise<IuinStatusImage[]> {
    return statusEmojiFetch<IuinStatusImage[]>('/api/v4/iuin/status_emojis');
}

export async function uploadIuinStatusImage(file: File): Promise<IuinStatusImage> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('/api/v4/iuin/status_emojis', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }

    return response.json() as Promise<IuinStatusImage>;
}
