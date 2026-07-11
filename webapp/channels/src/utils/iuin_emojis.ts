// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type IuinEmoji = {
    id: string;
    name: string;
    creatorUserId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    sha256: string;
    imageUrl: string;
    createdAt: number;
    updatedAt: number;
    libraryAt: number;
};

async function iuinFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return response.json() as Promise<T>;
}

export function listIuinEmojis(): Promise<IuinEmoji[]> {
    return iuinFetch<IuinEmoji[]>('/api/v4/iuin/emojis');
}

export function uploadIuinEmoji(file: File): Promise<IuinEmoji> {
    const formData = new FormData();
    formData.append('image', file);
    return iuinFetch<IuinEmoji>('/api/v4/iuin/emojis', {method: 'POST', body: formData});
}

export function addIuinEmojiToLibrary(emojiId: string): Promise<IuinEmoji> {
    return iuinFetch<IuinEmoji>(`/api/v4/iuin/emojis/${emojiId}/library`, {method: 'POST'});
}

export function removeIuinEmojiFromLibrary(emojiId: string): Promise<void> {
    return iuinFetch<void>(`/api/v4/iuin/emojis/${emojiId}/library`, {method: 'DELETE'});
}

export function sendIuinEmoji(emojiId: string, channelId: string, rootId?: string): Promise<unknown> {
    return iuinFetch<unknown>(`/api/v4/iuin/emojis/${emojiId}/send`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({channel_id: channelId, root_id: rootId || ''}),
    });
}

export function listIuinRecentEmojis(): Promise<string[]> {
    return iuinFetch<string[]>('/api/v4/iuin/recent_emojis');
}

export function recordIuinRecentEmoji(emojiName: string): Promise<unknown> {
    return iuinFetch<unknown>('/api/v4/iuin/recent_emojis', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({emoji_name: emojiName}),
    });
}

export function recordIuinRecentEmojis(emojiNames: string[]): void {
    emojiNames.forEach((emojiName) => recordIuinRecentEmoji(emojiName).catch(() => undefined));
}
