// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Client4} from 'mattermost-redux/client';

export type IuinAchievementItem = {
    id: string;
    name: string;
    description: string;
    iconStorageKey: string;
    category: string;
    rarity: string;
    unlockHint: string;
    sortOrder: number;
    unlocked: boolean;
    featured: boolean;
    featuredOrder: number;
};

export type IuinTitleItem = {
    id: string;
    name: string;
    description: string;
    iconStorageKey: string;
    rarity: string;
    unlockHint: string;
    sortOrder: number;
    unlocked: boolean;
    equipped: boolean;
};

export type IuinAvatarFrameItem = {
    id: string;
    name: string;
    description: string;
    frameStorageKey: string;
    previewStorageKey: string;
    rarity: string;
    unlockHint: string;
    sortOrder: number;
    unlocked: boolean;
    equipped: boolean;
};

export type IuinHonorSummary = {
    title: IuinTitleItem | null;
    avatarFrame: IuinAvatarFrameItem | null;
    featuredAchievements: IuinAchievementItem[];
};

export type IuinAchievementsResponse = {
    achievements: IuinAchievementItem[];
    featuredLimit: number;
};

export type IuinTitlesResponse = {
    titles: IuinTitleItem[];
};

export type IuinAvatarFramesResponse = {
    avatarFrames: IuinAvatarFrameItem[];
};

export const IUIN_HONOR_SUMMARY_CHANGED_EVENT = 'iuin_honor_summary_changed';

export const IUIN_HONOR_RARITIES = ['common', 'rare', 'epic', 'hidden'] as const;

export type IuinHonorRarity = typeof IUIN_HONOR_RARITIES[number];

type IuinHonorFetchOptions = Parameters<typeof Client4.getOptions>[0];

const summaryCache = new Map<string, IuinHonorSummary | null>();
const summaryRequests = new Map<string, Promise<IuinHonorSummary | null>>();

export function isIuinHonorItemHidden(item?: {rarity?: string; unlocked?: boolean} | null): boolean {
    return normalizeIuinHonorRarity(item?.rarity) === 'hidden' && !item?.unlocked;
}

export function normalizeIuinHonorRarity(rarity?: string): IuinHonorRarity {
    const normalized = rarity?.trim().toLowerCase();
    if (IUIN_HONOR_RARITIES.includes(normalized as IuinHonorRarity)) {
        return normalized as IuinHonorRarity;
    }

    return 'common';
}

export function getIuinHonorRarityLabel(rarity?: string): IuinHonorRarity {
    return normalizeIuinHonorRarity(rarity);
}

export function getIuinHonorRarityClassName(rarity?: string): string {
    return `iuin-honor-rarity-tag--${normalizeIuinHonorRarity(rarity)}`;
}

export function getFeaturedAchievementIds(achievements: IuinAchievementItem[]): string[] {
    return achievements.
        filter((achievement) => achievement.featured).
        sort((a, b) => a.featuredOrder - b.featuredOrder || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).
        map((achievement) => achievement.id);
}

export function getIuinHonorAssetUrl(storageKey?: string): string {
    const key = storageKey?.trim();
    if (!key || !key.startsWith('profile/honors/')) {
        return '';
    }

    return `${Client4.getUsersRoute()}/iuin_honors/asset?key=${encodeURIComponent(key)}`;
}

export async function fetchIuinHonorSummary(userId: string): Promise<IuinHonorSummary> {
    return fetchIuinHonorJSON<IuinHonorSummary>(`${Client4.getUserRoute(userId)}/iuin_honors/summary`, {
        method: 'GET',
    });
}

export async function getIuinHonorSummaryCached(userId: string): Promise<IuinHonorSummary | null> {
    if (!userId) {
        return null;
    }

    if (summaryCache.has(userId)) {
        return summaryCache.get(userId) || null;
    }

    const existingRequest = summaryRequests.get(userId);
    if (existingRequest) {
        return existingRequest;
    }

    const request = fetchIuinHonorSummary(userId).then((summary) => {
        summaryCache.set(userId, summary);
        return summary;
    }).catch(() => {
        summaryCache.set(userId, null);
        return null;
    }).finally(() => {
        summaryRequests.delete(userId);
    });

    summaryRequests.set(userId, request);
    return request;
}

export function invalidateIuinHonorSummary(userId: string) {
    if (!userId) {
        return;
    }

    summaryCache.delete(userId);
    summaryRequests.delete(userId);

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(IUIN_HONOR_SUMMARY_CHANGED_EVENT, {
            detail: {userId},
        }));
    }
}

export async function fetchIuinAchievements(userId: string): Promise<IuinAchievementsResponse> {
    return fetchIuinHonorJSON<IuinAchievementsResponse>(`${Client4.getUserRoute(userId)}/iuin_achievements`, {
        method: 'GET',
    });
}

export async function saveIuinFeaturedAchievements(userId: string, achievementIds: string[]): Promise<IuinAchievementsResponse> {
    const response = await fetchIuinHonorJSON<IuinAchievementsResponse>(`${Client4.getUserRoute(userId)}/iuin_achievements/featured`, {
        method: 'PUT',
        body: JSON.stringify({achievement_ids: achievementIds}),
    });
    invalidateIuinHonorSummary(userId);
    return response;
}

export async function fetchIuinTitles(userId: string): Promise<IuinTitlesResponse> {
    return fetchIuinHonorJSON<IuinTitlesResponse>(`${Client4.getUserRoute(userId)}/iuin_titles`, {
        method: 'GET',
    });
}

export async function equipIuinTitle(userId: string, titleId: string): Promise<IuinTitlesResponse> {
    const response = await fetchIuinHonorJSON<IuinTitlesResponse>(`${Client4.getUserRoute(userId)}/iuin_titles/equipped`, {
        method: 'PUT',
        body: JSON.stringify({title_id: titleId}),
    });
    invalidateIuinHonorSummary(userId);
    return response;
}

export async function fetchIuinAvatarFrames(userId: string): Promise<IuinAvatarFramesResponse> {
    return fetchIuinHonorJSON<IuinAvatarFramesResponse>(`${Client4.getUserRoute(userId)}/iuin_avatar_frames`, {
        method: 'GET',
    });
}

export async function equipIuinAvatarFrame(userId: string, avatarFrameId: string): Promise<IuinAvatarFramesResponse> {
    const response = await fetchIuinHonorJSON<IuinAvatarFramesResponse>(`${Client4.getUserRoute(userId)}/iuin_avatar_frames/equipped`, {
        method: 'PUT',
        body: JSON.stringify({avatar_frame_id: avatarFrameId}),
    });
    invalidateIuinHonorSummary(userId);
    return response;
}

async function fetchIuinHonorJSON<T>(url: string, options: IuinHonorFetchOptions): Promise<T> {
    const response = await fetch(url, Client4.getOptions(options));
    if (!response.ok) {
        let message = response.statusText;
        try {
            const body = await response.json();
            message = body.message || message;
        } catch {
            // Keep the HTTP status text when the server does not return JSON.
        }

        throw new Error(message);
    }

    return response.json();
}
