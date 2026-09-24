// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Deprecated compatibility surface. There is no longer a separate sticker
// client or data source; every call delegates to the unified IUIN Emoji system.
export type {IuinEmoji as IuinSticker} from './iuin_emojis';
export {
    addIuinEmojiToLibrary as favoriteIuinSticker,
    listIuinEmojis as listIuinStickers,
    listIuinRecentEmojis,
    recordIuinRecentEmoji,
    recordIuinRecentEmojis,
    sendIuinEmoji as sendIuinSticker,
    uploadIuinEmoji as uploadIuinSticker,
} from './iuin_emojis';
