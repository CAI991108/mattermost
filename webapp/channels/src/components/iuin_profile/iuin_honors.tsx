// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {DragEvent, KeyboardEvent, MouseEvent} from 'react';
import {createPortal} from 'react-dom';
import {FormattedMessage, useIntl} from 'react-intl';

import IuinHonorRarityTag from 'components/iuin_honor_rarity_tag';

import type {
    IuinAchievementItem,
    IuinAvatarFrameItem,
    IuinHonorSummary,
    IuinTitleItem,
} from 'utils/iuin_honors';
import {
    equipIuinAvatarFrame,
    equipIuinTitle,
    fetchIuinAchievements,
    fetchIuinAvatarFrames,
    fetchIuinTitles,
    getFeaturedAchievementIds,
    getIuinHonorAssetUrl,
    isIuinHonorItemHidden,
    saveIuinFeaturedAchievements,
} from 'utils/iuin_honors';

export type HonorDialogState = 'achievements' | 'titles' | 'avatarFrames';

const IUIN_HONOR_DIALOG_EXIT_MS = 180;

type HonorSidebarProps = {
    summary: IuinHonorSummary | null;
    canEdit: boolean;
    onOpenDialog: (dialog: HonorDialogState) => void;
    username?: string;
};

function useIuinHonorDialogExit(onClose: () => void) {
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    const timerRef = useRef<number | null>(null);

    const requestClose = useCallback(() => {
        if (closingRef.current) {
            return;
        }

        closingRef.current = true;
        setClosing(true);

        if (typeof window === 'undefined') {
            onClose();
            return;
        }

        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            onClose();
        }, prefersReducedMotion ? 0 : IUIN_HONOR_DIALOG_EXIT_MS);
    }, [onClose]);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null && typeof window !== 'undefined') {
                window.clearTimeout(timerRef.current);
            }
        };
    }, []);

    return {closing, requestClose};
}

export function IuinProfileTitleSidebar({summary, canEdit, onOpenDialog}: Omit<HonorSidebarProps, 'username'>) {
    const title = isIuinHonorItemHidden(summary?.title) ? null : (summary?.title || null);

    return (
        <section className='iuin-profile-academic-sidebar__module iuin-profile-academic-sidebar__module--honors iuin-profile-academic-sidebar__module--title'>
            <div className='iuin-profile-academic-sidebar__module-heading iuin-profile-honors__heading'>
                <h2>
                    <FormattedMessage
                        id='iuin_profile.title.title'
                        defaultMessage='Title'
                    />
                </h2>
                {canEdit && (
                    <HonorIconButton
                        icon='icon-pencil-outline'
                        labelId='iuin_profile.title.edit'
                        labelDefault='Edit title'
                        onClick={() => onOpenDialog('titles')}
                    />
                )}
            </div>
            {title ? (
                <div className='iuin-profile-title-showcase'>
                    <IuinTitleBadge title={title}/>
                </div>
            ) : (
                <p className='iuin-profile-academic-sidebar__empty'>
                    <FormattedMessage
                        id='iuin_profile.title.no_equipped'
                        defaultMessage='No title equipped yet.'
                    />
                </p>
            )}
        </section>
    );
}

export function IuinProfileHonorSidebar({summary, canEdit, onOpenDialog, username}: HonorSidebarProps) {
    const featuredAchievements = (summary?.featuredAchievements || []).filter((achievement) => !isIuinHonorItemHidden(achievement));
    const [detailAchievement, setDetailAchievement] = useState<IuinAchievementItem | null>(null);

    return (
        <>
            <section className='iuin-profile-academic-sidebar__module iuin-profile-academic-sidebar__module--honors'>
                <div className='iuin-profile-academic-sidebar__module-heading iuin-profile-honors__heading'>
                    <h2>
                        <FormattedMessage
                            id='iuin_profile.honors.title'
                            defaultMessage='Honors'
                        />
                    </h2>
                    {canEdit && (
                        <HonorIconButton
                            icon='icon-pencil-outline'
                            labelId='iuin_profile.honors.edit'
                            labelDefault='Edit honors'
                            onClick={() => onOpenDialog('achievements')}
                        />
                    )}
                </div>
                {featuredAchievements.length > 0 ? (
                    <div className='iuin-profile-honors__achievement-orbs'>
                        {featuredAchievements.slice(0, 10).map((achievement) => (
                            <IuinAchievementOrb
                                key={achievement.id}
                                achievement={achievement}
                                onClick={() => setDetailAchievement(achievement)}
                            />
                        ))}
                    </div>
                ) : (
                    <p className='iuin-profile-academic-sidebar__empty'>
                        <FormattedMessage
                            id='iuin_profile.honors.no_featured'
                            defaultMessage='No featured achievements yet.'
                        />
                    </p>
                )}
            </section>
            {detailAchievement && typeof document !== 'undefined' && createPortal((
                <IuinAchievementDetailDialog
                    achievement={detailAchievement}
                    username={username}
                    onClose={() => setDetailAchievement(null)}
                />
            ), document.body)}
        </>
    );
}

export function IuinProfilePopoverHonors({summary}: {summary: IuinHonorSummary | null}) {
    return (
        <>
            <IuinProfilePopoverTitle summary={summary}/>
            <IuinProfilePopoverAchievements summary={summary}/>
        </>
    );
}

export function IuinProfilePopoverTitle({summary}: {summary: IuinHonorSummary | null}) {
    const title = isIuinHonorItemHidden(summary?.title) ? null : (summary?.title || null);

    if (!title) {
        return null;
    }

    return (
        <div className='user-profile-popover__iuin-title'>
            <IuinTitleBadge title={title}/>
        </div>
    );
}

export function IuinProfilePopoverAchievements({summary}: {summary: IuinHonorSummary | null}) {
    const achievements = (summary?.featuredAchievements || []).filter((achievement) => !isIuinHonorItemHidden(achievement)).slice(0, 3);

    if (achievements.length === 0) {
        return null;
    }

    return (
        <div className='user-profile-popover__iuin-achievements'>
            {achievements.map((achievement) => (
                <IuinAchievementOrb
                    key={achievement.id}
                    achievement={achievement}
                    disabled={true}
                    onClick={() => null}
                />
            ))}
        </div>
    );
}

export function IuinAvatarFramePreview({frame, label, initials, avatarUrl}: {frame: IuinAvatarFrameItem | null; label?: string; initials?: string; avatarUrl?: string}) {
    if (isIuinHonorItemHidden(frame)) {
        return null;
    }

    const assetUrl = getIuinHonorAssetUrl(frame?.previewStorageKey || frame?.frameStorageKey);

    return (
        <span className='iuin-profile-avatar-frame-preview'>
            <span
                className={classNames('iuin-profile-avatar-frame-preview__sample', {
                    'iuin-profile-avatar-frame-preview__sample--empty': !frame,
                })}
                aria-hidden={true}
            >
                <span>{initials || 'IU'}</span>
                {avatarUrl && (
                    <img
                        className='iuin-profile-avatar-frame-preview__avatar'
                        src={avatarUrl}
                        alt=''
                        draggable={false}
                        onError={(event) => {
                            event.currentTarget.style.display = 'none';
                        }}
                    />
                )}
                {assetUrl && (
                    <img
                        className='iuin-profile-avatar-frame-preview__frame-image'
                        src={assetUrl}
                        alt=''
                        draggable={false}
                    />
                )}
            </span>
            {label && (
                <span className='iuin-profile-avatar-frame-preview__label'>
                    {label}
                </span>
            )}
        </span>
    );
}

export function IuinAvatarFrameRing({frame}: {frame: IuinAvatarFrameItem | null}) {
    if (isIuinHonorItemHidden(frame)) {
        return null;
    }

    const assetUrl = getIuinHonorAssetUrl(frame?.frameStorageKey || frame?.previewStorageKey);

    if (!assetUrl) {
        return null;
    }

    return (
        <span
            className='iuin-profile-avatar-frame-ring'
            aria-hidden={true}
        >
            <img
                className='iuin-profile-avatar-frame-ring__image'
                src={assetUrl}
                alt=''
                draggable={false}
            />
        </span>
    );
}

export function IuinAvatarAppearanceDialog({
    userId,
    avatarUrl,
    displayName,
    initials,
    currentFrame,
    avatarChanged,
    avatarSaving,
    avatarError,
    onUploadAvatar,
    onClose,
    onSaved,
}: {
    userId: string;
    avatarUrl: string;
    displayName: string;
    initials: string;
    currentFrame: IuinAvatarFrameItem | null;
    avatarChanged: boolean;
    avatarSaving: boolean;
    avatarError: string;
    onUploadAvatar: () => void;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}) {
    const intl = useIntl();
    const {closing, requestClose} = useIuinHonorDialogExit(onClose);
    const [frames, setFrames] = useState<IuinAvatarFrameItem[]>([]);
    const [focusedFrameId, setFocusedFrameId] = useState('');
    const [selectedFrameId, setSelectedFrameId] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingFrameId, setSavingFrameId] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError('');
        fetchIuinAvatarFrames(userId).then((response) => {
            if (cancelled) {
                return;
            }

            const equippedFrame = response.avatarFrames.find((frame) => frame.equipped);
            const nextFrameId = equippedFrame?.id || response.avatarFrames.find((frame) => frame.unlocked)?.id || response.avatarFrames[0]?.id || '';
            setFrames(response.avatarFrames);
            setFocusedFrameId(nextFrameId);
            setSelectedFrameId(nextFrameId);
        }).catch((err: Error) => {
            if (!cancelled) {
                setError(err.message || intl.formatMessage({
                    id: 'iuin_profile.honors.load_error',
                    defaultMessage: 'Could not load honors.',
                }));
            }
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [intl, userId]);

    const visibleCurrentFrame = useMemo(() => {
        if (!loading && frames.length > 0) {
            return null;
        }

        return isIuinHonorItemHidden(currentFrame) ? null : currentFrame;
    }, [currentFrame, frames.length, loading]);

    const equippedFrame = useMemo(() => {
        return frames.find((frame) => frame.equipped) || null;
    }, [frames]);

    const selectedFrame = useMemo(() => {
        return frames.find((frame) => frame.id === selectedFrameId) || equippedFrame || null;
    }, [equippedFrame, frames, selectedFrameId]);

    const selectedFrameInList = useMemo(() => {
        return frames.find((frame) => frame.id === selectedFrameId) || null;
    }, [frames, selectedFrameId]);

    const focusedFrame = useMemo(() => {
        return frames.find((frame) => frame.id === focusedFrameId) || equippedFrame || frames[0] || null;
    }, [equippedFrame, focusedFrameId, frames]);

    const frameChanged = Boolean(selectedFrameInList?.unlocked && selectedFrameId !== equippedFrame?.id);
    const saveDisabled = closing || avatarSaving || Boolean(savingFrameId) || (!avatarChanged && !frameChanged);

    let focusedFrameUnlockCondition = '';
    let focusedFrameStateLabel: React.ReactNode = null;
    if (focusedFrame) {
        focusedFrameUnlockCondition = focusedFrame.unlockHint;
        if (!focusedFrameUnlockCondition) {
            focusedFrameUnlockCondition = focusedFrame.unlocked ? intl.formatMessage({id: 'iuin_profile.achievements_dialog.unlocked', defaultMessage: 'Unlocked'}) : intl.formatMessage({id: 'iuin_profile.honors.locked', defaultMessage: 'Locked'});
        }

        if (focusedFrame.equipped) {
            focusedFrameStateLabel = (
                <FormattedMessage
                    id='iuin_profile.avatar_manager.equipped'
                    defaultMessage='Equipped'
                />
            );
        } else if (focusedFrame.id === selectedFrameId && focusedFrame.unlocked) {
            focusedFrameStateLabel = (
                <FormattedMessage
                    id='iuin_profile.avatar_manager.selected'
                    defaultMessage='Selected'
                />
            );
        } else if (focusedFrame.unlocked) {
            focusedFrameStateLabel = (
                <FormattedMessage
                    id='iuin_profile.avatar_manager.unlocked'
                    defaultMessage='Unlocked'
                />
            );
        } else {
            focusedFrameStateLabel = (
                <FormattedMessage
                    id='iuin_profile.honors.locked'
                    defaultMessage='Locked'
                />
            );
        }
    }

    const handleFrameClick = useCallback((frame: IuinAvatarFrameItem) => {
        if (savingFrameId || closing) {
            return;
        }

        setFocusedFrameId(frame.id);
        setError('');

        if (!frame.unlocked) {
            return;
        }

        setSelectedFrameId(frame.id);
    }, [closing, savingFrameId]);

    const handleSaveAppearance = useCallback(async () => {
        const frame = frames.find((item) => item.id === selectedFrameId);
        const shouldSaveFrame = Boolean(frame?.unlocked && selectedFrameId !== equippedFrame?.id);
        if (closing || savingFrameId || avatarSaving || (!avatarChanged && !shouldSaveFrame)) {
            return;
        }

        setSavingFrameId(shouldSaveFrame ? selectedFrameId : '__avatar_appearance__');
        setError('');
        try {
            if (shouldSaveFrame) {
                const response = await equipIuinAvatarFrame(userId, selectedFrameId);
                const nextEquippedFrame = response.avatarFrames.find((item) => item.equipped);
                const nextFrameId = nextEquippedFrame?.id || selectedFrameId;
                setFrames(response.avatarFrames);
                setSelectedFrameId(nextFrameId);
                setFocusedFrameId(nextFrameId);
            }
            await onSaved();
            requestClose();
        } catch (err) {
            setError((err as Error).message || intl.formatMessage({
                id: 'iuin_profile.honors.save_error',
                defaultMessage: 'Could not save honors.',
            }));
        } finally {
            setSavingFrameId('');
        }
    }, [avatarChanged, avatarSaving, closing, equippedFrame?.id, frames, intl, onSaved, requestClose, savingFrameId, selectedFrameId, userId]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && !closing && !savingFrameId && !avatarSaving) {
            event.preventDefault();
            requestClose();
        }
    }, [avatarSaving, closing, requestClose, savingFrameId]);

    return (
        <div
            className={classNames('iuin-profile-entry-dialog__backdrop iuin-profile-avatar-manager__backdrop', {
                'iuin-profile-avatar-manager__backdrop--closing': closing,
            })}
        >
            <section
                className={classNames('iuin-profile-entry-dialog iuin-profile-avatar-manager', {
                    'iuin-profile-avatar-manager--saving': Boolean(savingFrameId) || avatarSaving,
                    'iuin-profile-avatar-manager--closing': closing,
                })}
                role='dialog'
                aria-modal='true'
                aria-labelledby='iuin-profile-avatar-manager-title'
                onKeyDown={handleKeyDown}
            >
                <div className='iuin-profile-entry-dialog__header'>
                    <div>
                        <h2 id='iuin-profile-avatar-manager-title'>
                            <FormattedMessage
                                id='iuin_profile.avatar_manager.title'
                                defaultMessage='Avatar style'
                            />
                        </h2>
                        <span>
                            <FormattedMessage
                                id='iuin_profile.avatar_manager.eyebrow'
                                defaultMessage='Choose your profile picture and avatar frame'
                            />
                        </span>
                    </div>
                    <HonorActionIconButton
                        className='iuin-profile-entry-dialog__close'
                        label={intl.formatMessage({
                            id: 'iuin_profile.editor.section_dialog_close',
                            defaultMessage: 'Close dialog',
                        })}
                        disabled={Boolean(savingFrameId) || avatarSaving || closing}
                        onClick={requestClose}
                    />
                </div>
                <div className='iuin-profile-avatar-manager__body'>
                    <section className='iuin-profile-avatar-manager__avatar-panel'>
                        <span className='iuin-profile-avatar-manager__avatar-preview'>
                            <span
                                className='iuin-profile-avatar-manager__avatar-fallback'
                                aria-hidden={true}
                            >
                                {initials}
                            </span>
                            <img
                                src={avatarUrl}
                                alt={displayName}
                                onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                }}
                            />
                            <IuinAvatarFrameRing frame={selectedFrame || equippedFrame || visibleCurrentFrame}/>
                        </span>
                        <div className='iuin-profile-avatar-manager__avatar-copy'>
                            <h3>
                                <FormattedMessage
                                    id='iuin_profile.avatar_manager.avatar_title'
                                    defaultMessage='Profile picture'
                                />
                            </h3>
                            <p>
                                <FormattedMessage
                                    id='iuin_profile.avatar_manager.avatar_body'
                                    defaultMessage='Upload a square image, then crop it before it becomes your avatar.'
                                />
                            </p>
                            <button
                                type='button'
                                className='iuin-profile-avatar-manager__upload'
                                disabled={avatarSaving || closing}
                                onClick={onUploadAvatar}
                            >
                                <i className={`icon ${avatarSaving ? 'icon-loading icon-spin' : 'icon-pencil-outline'}`}/>
                                <span>
                                    {avatarSaving ? (
                                        <FormattedMessage
                                            id='iuin_profile.avatar_uploading'
                                            defaultMessage='Uploading'
                                        />
                                    ) : (
                                        <FormattedMessage
                                            id='iuin_profile.avatar_manager.upload'
                                            defaultMessage='Choose avatar'
                                        />
                                    )}
                                </span>
                            </button>
                            {avatarError && (
                                <p className='iuin-profile-avatar-manager__error'>
                                    {avatarError}
                                </p>
                            )}
                        </div>
                    </section>
                    <section className='iuin-profile-avatar-manager__frames'>
                        <div className='iuin-profile-avatar-manager__section-heading'>
                            <h3>
                                <FormattedMessage
                                    id='iuin_profile.avatar_manager.frames_title'
                                    defaultMessage='Avatar frame'
                                />
                            </h3>
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.avatar_manager.frames_hint'
                                    defaultMessage='Select an unlocked frame, then save it. Locked frames show how to unlock them.'
                                />
                            </span>
                        </div>
                        {loading ? (
                            <p className='iuin-profile-honor-dialog__empty'>
                                <FormattedMessage
                                    id='iuin_profile.honors.loading'
                                    defaultMessage='Loading honors...'
                                />
                            </p>
                        ) : (
                            <div className='iuin-profile-avatar-manager__frame-grid'>
                                {frames.map((frame) => {
                                    const selected = selectedFrameId === frame.id;
                                    const focused = focusedFrame?.id === frame.id;
                                    const locked = !frame.unlocked;
                                    const saving = savingFrameId === frame.id;
                                    const assetUrl = getIuinHonorAssetUrl(frame.previewStorageKey || frame.frameStorageKey);

                                    return (
                                        <button
                                            key={frame.id}
                                            type='button'
                                            className={classNames('iuin-profile-avatar-manager__frame', {
                                                'iuin-profile-avatar-manager__frame--selected': selected,
                                                'iuin-profile-avatar-manager__frame--focused': focused,
                                                'iuin-profile-avatar-manager__frame--locked': locked,
                                                'iuin-profile-avatar-manager__frame--saving': saving,
                                            })}
                                            aria-pressed={selected}
                                            aria-disabled={locked || Boolean(savingFrameId) || closing}
                                            title={locked ? frame.unlockHint : frame.name}
                                            onClick={() => handleFrameClick(frame)}
                                        >
                                            <span
                                                className='iuin-profile-avatar-manager__frame-sample'
                                                aria-hidden={true}
                                            >
                                                <span>{initials}</span>
                                                <img
                                                    className='iuin-profile-avatar-manager__frame-avatar'
                                                    src={avatarUrl}
                                                    alt=''
                                                    draggable={false}
                                                    onError={(event) => {
                                                        event.currentTarget.style.display = 'none';
                                                    }}
                                                />
                                                {assetUrl && (
                                                    <img
                                                        className='iuin-profile-avatar-manager__frame-image'
                                                        src={assetUrl}
                                                        alt=''
                                                        draggable={false}
                                                    />
                                                )}
                                            </span>
                                            {locked && <span className='iuin-profile-avatar-manager__frame-lock'><i className='icon icon-lock-outline'/></span>}
                                            {saving && <span className='iuin-profile-avatar-manager__frame-saving'><i className='icon icon-loading icon-spin'/></span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {focusedFrame && (
                            <div className='iuin-profile-avatar-manager__inspector'>
                                <IuinAvatarFramePreview
                                    frame={focusedFrame}
                                    initials={initials}
                                    avatarUrl={avatarUrl}
                                />
                                <div>
                                    <strong>{focusedFrame.name}</strong>
                                    <p>{focusedFrame.description}</p>
                                    <em>
                                        <FormattedMessage
                                            id='iuin_profile.avatar_manager.unlock_condition'
                                            defaultMessage='Unlock condition: {condition}'
                                            values={{condition: focusedFrameUnlockCondition}}
                                        />
                                    </em>
                                    <div className='iuin-profile-avatar-manager__meta'>
                                        <IuinHonorRarityTag
                                            rarity={focusedFrame.rarity}
                                            compact={true}
                                        />
                                    </div>
                                    <span className='iuin-profile-avatar-manager__state'>
                                        {focusedFrameStateLabel}
                                    </span>
                                </div>
                            </div>
                        )}
                        {error && <p className='iuin-profile-fields-dialog__error'>{error}</p>}
                    </section>
                </div>
                <div className='iuin-profile-entry-dialog__actions iuin-profile-avatar-manager__actions'>
                    <button
                        type='button'
                        className='iuin-profile-button iuin-profile-button--subtle'
                        disabled={Boolean(savingFrameId) || avatarSaving || closing}
                        onClick={requestClose}
                    >
                        <FormattedMessage
                            id='iuin_profile.editor.cancel'
                            defaultMessage='Cancel'
                        />
                    </button>
                    <button
                        type='button'
                        className='iuin-profile-button'
                        disabled={saveDisabled}
                        onClick={handleSaveAppearance}
                    >
                        {savingFrameId ? (
                            <FormattedMessage
                                id='iuin_profile.editor.saving'
                                defaultMessage='Saving...'
                            />
                        ) : (
                            <FormattedMessage
                                id='iuin_profile.avatar_manager.save_frame'
                                defaultMessage='Save'
                            />
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
}

export function IuinAchievementsDialog({
    userId,
    onClose,
    onSaved,
}: {
    userId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const intl = useIntl();
    const {closing, requestClose} = useIuinHonorDialogExit(onClose);
    const [achievements, setAchievements] = useState<IuinAchievementItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [featuredLimit, setFeaturedLimit] = useState(10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [focusedAchievementId, setFocusedAchievementId] = useState('');
    const [draggingAchievementId, setDraggingAchievementId] = useState('');

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError('');
        fetchIuinAchievements(userId).then((response) => {
            if (cancelled) {
                return;
            }

            const featuredIds = getFeaturedAchievementIds(response.achievements).slice(0, response.featuredLimit);
            setAchievements(response.achievements);
            setFeaturedLimit(response.featuredLimit);
            setSelectedIds(featuredIds);
            setFocusedAchievementId((previous) => previous || featuredIds[0] || response.achievements[0]?.id || '');
        }).catch((err: Error) => {
            if (!cancelled) {
                setError(err.message || intl.formatMessage({
                    id: 'iuin_profile.honors.load_error',
                    defaultMessage: 'Could not load honors.',
                }));
            }
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [intl, userId]);

    const selectedAchievements = useMemo(() => {
        const byId = new Map(achievements.map((achievement) => [achievement.id, achievement]));
        return selectedIds.map((id) => byId.get(id)).filter(Boolean) as IuinAchievementItem[];
    }, [achievements, selectedIds]);

    const focusedAchievement = useMemo(() => {
        return achievements.find((achievement) => achievement.id === focusedAchievementId) || selectedAchievements[0] || achievements[0] || null;
    }, [achievements, focusedAchievementId, selectedAchievements]);

    const handleAchievementFocus = useCallback((achievement: IuinAchievementItem) => {
        setFocusedAchievementId(achievement.id);

        if (!achievement.unlocked || saving || closing) {
            return;
        }

        setSelectedIds((previous) => {
            if (previous.includes(achievement.id)) {
                return previous;
            }

            if (previous.length >= featuredLimit) {
                return previous;
            }

            return [...previous, achievement.id];
        });
    }, [closing, featuredLimit, saving]);

    const removeSelectedAchievement = useCallback((event: MouseEvent<HTMLButtonElement>, achievementId: string) => {
        event.stopPropagation();
        setSelectedIds((previous) => previous.filter((id) => id !== achievementId));
    }, []);

    const reorderSelectedAchievement = useCallback((achievementId: string, targetIndex: number) => {
        setSelectedIds((previous) => {
            const currentIndex = previous.indexOf(achievementId);
            if (currentIndex === -1) {
                return previous;
            }

            const next = previous.filter((id) => id !== achievementId);
            next.splice(Math.min(targetIndex, next.length), 0, achievementId);
            return next;
        });
    }, []);

    const handleWallDragStart = useCallback((event: DragEvent<HTMLButtonElement>, achievementId: string) => {
        setDraggingAchievementId(achievementId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', achievementId);
    }, []);

    const handleWallDrop = useCallback((event: DragEvent<HTMLElement>, targetIndex: number) => {
        event.preventDefault();
        const achievementId = draggingAchievementId || event.dataTransfer.getData('text/plain');
        if (!achievementId) {
            return;
        }

        reorderSelectedAchievement(achievementId, targetIndex);
        setDraggingAchievementId('');
    }, [draggingAchievementId, reorderSelectedAchievement]);

    const handleWallDragOver = useCallback((event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleSave = useCallback(async () => {
        if (closing) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            await saveIuinFeaturedAchievements(userId, selectedIds);
            onSaved();
            requestClose();
        } catch (err) {
            setError((err as Error).message || intl.formatMessage({
                id: 'iuin_profile.honors.save_error',
                defaultMessage: 'Could not save honors.',
            }));
        } finally {
            setSaving(false);
        }
    }, [closing, intl, onSaved, requestClose, selectedIds, userId]);

    return (
        <IuinHonorDialogShell
            titleId='iuin-profile-achievements-dialog-title'
            title={(
                <FormattedMessage
                    id='iuin_profile.achievements_dialog.title'
                    defaultMessage='Honors'
                />
            )}
            eyebrow={(
                <FormattedMessage
                    id='iuin_profile.achievements_dialog.eyebrow'
                    defaultMessage='Choose the achievement icons shown on your profile'
                />
            )}
            saving={saving}
            closing={closing}
            onClose={requestClose}
            onSave={handleSave}
            saveLabel={(
                <FormattedMessage
                    id='iuin_profile.achievements_dialog.save'
                    defaultMessage='Save'
                />
            )}
            saveDisabled={loading || closing}
        >
            <div className='iuin-profile-honor-dialog__summary'>
                <span>
                    <FormattedMessage
                        id='iuin_profile.achievements_dialog.selected_count'
                        defaultMessage='{count}/{limit} selected'
                        values={{count: selectedIds.length, limit: featuredLimit}}
                    />
                </span>
            </div>
            <div className='iuin-profile-honor-wall'>
                {Array.from({length: featuredLimit}).map((_, index) => {
                    const achievement = selectedAchievements[index];

                    return (
                        <div
                            key={achievement?.id || `empty-${index}`}
                            className={classNames('iuin-profile-honor-wall__slot', {
                                'iuin-profile-honor-wall__slot--empty': !achievement,
                                'iuin-profile-honor-wall__slot--drop-target': draggingAchievementId && (!achievement || achievement.id !== draggingAchievementId),
                            })}
                            onDragOver={handleWallDragOver}
                            onDrop={(event) => handleWallDrop(event, index)}
                        >
                            {achievement ? (
                                <>
                                    <IuinAchievementOrb
                                        achievement={achievement}
                                        selected={true}
                                        dragging={achievement.id === draggingAchievementId}
                                        draggable={true}
                                        onDragStart={(event) => handleWallDragStart(event, achievement.id)}
                                        onDragEnd={() => setDraggingAchievementId('')}
                                        onClick={() => setFocusedAchievementId(achievement.id)}
                                    />
                                    <HonorActionIconButton
                                        className='iuin-profile-honor-wall__remove'
                                        label={intl.formatMessage({
                                            id: 'iuin_profile.achievements_dialog.remove',
                                            defaultMessage: 'Remove achievement from honors wall',
                                        })}
                                        disabled={saving || closing}
                                        onClick={(event) => removeSelectedAchievement(event, achievement.id)}
                                    />
                                </>
                            ) : (
                                <span aria-hidden={true}/>
                            )}
                        </div>
                    );
                })}
            </div>
            <AchievementIconGrid
                loading={loading}
                achievements={achievements}
                selectedIds={selectedIds}
                focusedAchievementId={focusedAchievement?.id || ''}
                saving={saving || closing}
                onSelect={handleAchievementFocus}
            />
            {focusedAchievement && (
                <div className='iuin-profile-honor-inspector'>
                    <div className='iuin-profile-honor-inspector__icon'>
                        <IuinAchievementOrb
                            achievement={focusedAchievement}
                            locked={!focusedAchievement.unlocked}
                            selected={selectedIds.includes(focusedAchievement.id)}
                            onClick={() => undefined}
                        />
                    </div>
                    <div className='iuin-profile-honor-inspector__content'>
                        <strong>{focusedAchievement.name}</strong>
                        <span className='iuin-profile-honor-inspector__description'>{focusedAchievement.description}</span>
                        <em>
                            <FormattedMessage
                                id='iuin_profile.achievements_dialog.unlock_condition'
                                defaultMessage='Unlock condition: {condition}'
                                values={{condition: focusedAchievement.unlockHint || (focusedAchievement.unlocked ? intl.formatMessage({id: 'iuin_profile.achievements_dialog.unlocked', defaultMessage: 'Unlocked'}) : intl.formatMessage({id: 'iuin_profile.honors.locked', defaultMessage: 'Locked'}))}}
                            />
                        </em>
                        <div className='iuin-profile-honor-inspector__meta'>
                            <IuinHonorRarityTag
                                rarity={focusedAchievement.rarity}
                                compact={true}
                            />
                        </div>
                    </div>
                </div>
            )}
            {error && <p className='iuin-profile-fields-dialog__error'>{error}</p>}
        </IuinHonorDialogShell>
    );
}

export function IuinTitlesDialog({
    userId,
    onClose,
    onSaved,
}: {
    userId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const intl = useIntl();
    const {closing, requestClose} = useIuinHonorDialogExit(onClose);
    const [titles, setTitles] = useState<IuinTitleItem[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [focusedTitleId, setFocusedTitleId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError('');
        fetchIuinTitles(userId).then((response) => {
            if (cancelled) {
                return;
            }

            const equippedId = response.titles.find((title) => title.equipped)?.id || '';
            const nextSelectedId = equippedId || response.titles.find((title) => title.unlocked)?.id || '';
            setTitles(response.titles);
            setSelectedId(nextSelectedId);
            setFocusedTitleId((previous) => previous || nextSelectedId || response.titles[0]?.id || '');
        }).catch((err: Error) => {
            if (!cancelled) {
                setError(err.message || intl.formatMessage({
                    id: 'iuin_profile.honors.load_error',
                    defaultMessage: 'Could not load honors.',
                }));
            }
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [intl, userId]);

    const equippedTitle = useMemo(() => {
        return titles.find((title) => title.equipped) || null;
    }, [titles]);

    const selectedTitle = useMemo(() => {
        return titles.find((title) => title.id === selectedId) || equippedTitle || null;
    }, [equippedTitle, selectedId, titles]);

    const selectedTitleInList = useMemo(() => {
        return titles.find((title) => title.id === selectedId) || null;
    }, [selectedId, titles]);

    const focusedTitle = useMemo(() => {
        return titles.find((title) => title.id === focusedTitleId) || selectedTitle || titles[0] || null;
    }, [focusedTitleId, selectedTitle, titles]);

    const handleTitleSelect = useCallback((title: IuinTitleItem) => {
        if (saving || closing) {
            return;
        }

        setFocusedTitleId(title.id);
        setError('');

        if (!title.unlocked) {
            return;
        }

        setSelectedId(title.id);
    }, [closing, saving]);

    const handleSave = useCallback(async () => {
        const title = titles.find((item) => item.id === selectedId);
        if (!title?.unlocked || saving || closing) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            await equipIuinTitle(userId, selectedId);
            onSaved();
            requestClose();
        } catch (err) {
            setError((err as Error).message || intl.formatMessage({
                id: 'iuin_profile.honors.save_error',
                defaultMessage: 'Could not save honors.',
            }));
        } finally {
            setSaving(false);
        }
    }, [closing, intl, onSaved, requestClose, saving, selectedId, titles, userId]);

    const focusedTitleUnlockCondition = focusedTitle?.unlockHint || (focusedTitle?.unlocked ? intl.formatMessage({id: 'iuin_profile.achievements_dialog.unlocked', defaultMessage: 'Unlocked'}) : intl.formatMessage({id: 'iuin_profile.honors.locked', defaultMessage: 'Locked'}));
    const saveDisabled = closing || loading || !selectedTitleInList?.unlocked || selectedId === equippedTitle?.id;

    return (
        <IuinHonorDialogShell
            titleId='iuin-profile-titles-dialog-title'
            title={(
                <FormattedMessage
                    id='iuin_profile.titles_dialog.title'
                    defaultMessage='Profile title'
                />
            )}
            eyebrow={(
                <FormattedMessage
                    id='iuin_profile.titles_dialog.eyebrow'
                    defaultMessage='Choose one unlocked title image to wear'
                />
            )}
            saving={saving}
            closing={closing}
            onClose={requestClose}
            onSave={handleSave}
            saveLabel={(
                <FormattedMessage
                    id='iuin_profile.titles_dialog.save'
                    defaultMessage='Save'
                />
            )}
            saveDisabled={saveDisabled}
        >
            <TitleImageGrid
                loading={loading}
                titles={titles}
                selectedId={selectedId}
                focusedTitleId={focusedTitle?.id || ''}
                saving={saving || closing}
                onSelect={handleTitleSelect}
            />
            {focusedTitle && (
                <div className='iuin-profile-honor-inspector iuin-profile-title-inspector'>
                    <div className='iuin-profile-honor-inspector__icon'>
                        <span className='iuin-profile-title-preview'>
                            <IuinTitleArtwork title={focusedTitle}/>
                        </span>
                    </div>
                    <div className='iuin-profile-honor-inspector__content'>
                        <strong>{focusedTitle.name}</strong>
                        <span className='iuin-profile-honor-inspector__description'>{focusedTitle.description}</span>
                        <em>
                            <FormattedMessage
                                id='iuin_profile.avatar_manager.unlock_condition'
                                defaultMessage='Unlock condition: {condition}'
                                values={{condition: focusedTitleUnlockCondition}}
                            />
                        </em>
                        <div className='iuin-profile-honor-inspector__meta'>
                            <IuinHonorRarityTag
                                rarity={focusedTitle.rarity}
                                compact={true}
                            />
                        </div>
                    </div>
                </div>
            )}
            {error && <p className='iuin-profile-fields-dialog__error'>{error}</p>}
        </IuinHonorDialogShell>
    );
}

export function IuinAvatarFramesDialog({
    userId,
    onClose,
    onSaved,
}: {
    userId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const intl = useIntl();
    const {closing, requestClose} = useIuinHonorDialogExit(onClose);
    const [frames, setFrames] = useState<IuinAvatarFrameItem[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError('');
        fetchIuinAvatarFrames(userId).then((response) => {
            if (cancelled) {
                return;
            }

            setFrames(response.avatarFrames);
            setSelectedId(response.avatarFrames.find((frame) => frame.equipped)?.id || response.avatarFrames.find((frame) => frame.unlocked)?.id || '');
        }).catch((err: Error) => {
            if (!cancelled) {
                setError(err.message || intl.formatMessage({
                    id: 'iuin_profile.honors.load_error',
                    defaultMessage: 'Could not load honors.',
                }));
            }
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [intl, userId]);

    const handleSave = useCallback(async () => {
        if (closing) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            await equipIuinAvatarFrame(userId, selectedId);
            onSaved();
            requestClose();
        } catch (err) {
            setError((err as Error).message || intl.formatMessage({
                id: 'iuin_profile.honors.save_error',
                defaultMessage: 'Could not save honors.',
            }));
        } finally {
            setSaving(false);
        }
    }, [closing, intl, onSaved, requestClose, selectedId, userId]);

    return (
        <IuinHonorDialogShell
            titleId='iuin-profile-avatar-frames-dialog-title'
            title={(
                <FormattedMessage
                    id='iuin_profile.avatar_frames_dialog.title'
                    defaultMessage='Avatar frame'
                />
            )}
            eyebrow={(
                <FormattedMessage
                    id='iuin_profile.avatar_frames_dialog.eyebrow'
                    defaultMessage='Choose one unlocked frame to wear'
                />
            )}
            saving={saving}
            closing={closing}
            onClose={requestClose}
            onSave={handleSave}
            saveLabel={(
                <FormattedMessage
                    id='iuin_profile.avatar_frames_dialog.save'
                    defaultMessage='Save'
                />
            )}
            saveDisabled={closing || loading || !selectedId}
        >
            <HonorItemGrid
                loading={loading}
                items={frames}
                selectedIds={selectedId ? [selectedId] : []}
                saving={saving || closing}
                onToggle={(frame) => {
                    if (frame.unlocked && !closing) {
                        setSelectedId(frame.id);
                    }
                }}
                singleSelect={true}
            />
            {error && <p className='iuin-profile-fields-dialog__error'>{error}</p>}
        </IuinHonorDialogShell>
    );
}

function HonorIconButton({
    icon,
    labelId,
    labelDefault,
    onClick,
}: {
    icon: string;
    labelId: string;
    labelDefault: string;
    onClick: () => void;
}) {
    const intl = useIntl();

    return (
        <button
            type='button'
            className='iuin-profile-research-fields-edit iuin-profile-honors__icon-button'
            aria-label={intl.formatMessage({id: labelId, defaultMessage: labelDefault})}
            title={intl.formatMessage({id: labelId, defaultMessage: labelDefault})}
            onClick={onClick}
        >
            <i className={classNames('icon', icon)}/>
        </button>
    );
}

function HonorActionIconButton({
    className,
    icon = 'icon-close',
    label,
    disabled,
    onClick,
}: {
    className?: string;
    icon?: string;
    label: string;
    disabled?: boolean;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type='button'
            className={classNames('iuin-profile-honor-action-button', className)}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            <i className={classNames('icon', icon)}/>
        </button>
    );
}

function IuinTitleBadge({title}: {title: IuinTitleItem | null}) {
    if (!title) {
        return (
            <span className='iuin-profile-title-badge iuin-profile-title-badge--empty'>
                <FormattedMessage
                    id='iuin_profile.honors.no_title'
                    defaultMessage='No title'
                />
            </span>
        );
    }

    return (
        <span
            className='iuin-profile-title-badge'
            title={title.name}
            aria-label={title.name}
        >
            <IuinTitleArtwork title={title}/>
        </span>
    );
}

function IuinTitleArtwork({title, className}: {title: IuinTitleItem; className?: string}) {
    const assetUrl = getIuinHonorAssetUrl(title.iconStorageKey);

    if (!assetUrl) {
        return null;
    }

    return (
        <img
            className={classNames('iuin-profile-title-artwork', className)}
            src={assetUrl}
            alt=''
            aria-hidden={true}
            draggable={false}
        />
    );
}

function IuinAchievementArtwork({achievement, className}: {achievement: IuinAchievementItem; className?: string}) {
    const assetUrl = getIuinHonorAssetUrl(achievement.iconStorageKey);

    if (!assetUrl) {
        return null;
    }

    return (
        <span className={classNames('iuin-profile-achievement-artwork', className)}>
            <img
                className='iuin-profile-achievement-artwork__image'
                src={assetUrl}
                alt=''
                aria-hidden={true}
                draggable={false}
            />
        </span>
    );
}

function TitleImageGrid({
    loading,
    titles,
    selectedId,
    focusedTitleId,
    saving,
    onSelect,
}: {
    loading: boolean;
    titles: IuinTitleItem[];
    selectedId: string;
    focusedTitleId: string;
    saving: boolean;
    onSelect: (title: IuinTitleItem) => void;
}) {
    if (loading) {
        return (
            <p className='iuin-profile-honor-dialog__empty'>
                <FormattedMessage
                    id='iuin_profile.honors.loading'
                    defaultMessage='Loading honors...'
                />
            </p>
        );
    }

    if (titles.length === 0) {
        return (
            <p className='iuin-profile-honor-dialog__empty'>
                <FormattedMessage
                    id='iuin_profile.titles_dialog.no_titles'
                    defaultMessage='No titles available.'
                />
            </p>
        );
    }

    return (
        <div className='iuin-profile-title-vault'>
            {titles.map((title) => (
                <IuinTitleToken
                    key={title.id}
                    title={title}
                    locked={!title.unlocked}
                    selected={selectedId === title.id}
                    focused={focusedTitleId === title.id}
                    disabled={saving}
                    onClick={() => onSelect(title)}
                />
            ))}
        </div>
    );
}

function IuinTitleToken({
    title,
    locked,
    selected,
    focused,
    disabled,
    onClick,
}: {
    title: IuinTitleItem;
    locked?: boolean;
    selected?: boolean;
    focused?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className={classNames('iuin-profile-title-token', {
                'iuin-profile-title-token--image': Boolean(getIuinHonorAssetUrl(title.iconStorageKey)),
                'iuin-profile-title-token--locked': locked,
                'iuin-profile-title-token--selected': selected,
                'iuin-profile-title-token--focused': focused,
            })}
            title={locked ? title.unlockHint || title.name : title.name}
            aria-label={title.name}
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
        >
            <IuinTitleArtwork title={title}/>
            {locked && <span className='iuin-profile-title-token__lock'><i className='icon icon-lock-outline'/></span>}
        </button>
    );
}

function AchievementIconGrid({
    loading,
    achievements,
    selectedIds,
    focusedAchievementId,
    saving,
    onSelect,
}: {
    loading: boolean;
    achievements: IuinAchievementItem[];
    selectedIds: string[];
    focusedAchievementId: string;
    saving: boolean;
    onSelect: (achievement: IuinAchievementItem) => void;
}) {
    if (loading) {
        return (
            <p className='iuin-profile-honor-dialog__empty'>
                <FormattedMessage
                    id='iuin_profile.honors.loading'
                    defaultMessage='Loading honors...'
                />
            </p>
        );
    }

    if (achievements.length === 0) {
        return (
            <p className='iuin-profile-honor-dialog__empty'>
                <FormattedMessage
                    id='iuin_profile.achievements_dialog.no_achievements'
                    defaultMessage='No achievements available.'
                />
            </p>
        );
    }

    return (
        <div className='iuin-profile-achievement-vault'>
            {achievements.map((achievement) => (
                <IuinAchievementOrb
                    key={achievement.id}
                    achievement={achievement}
                    locked={!achievement.unlocked}
                    selected={selectedIds.includes(achievement.id)}
                    focused={focusedAchievementId === achievement.id}
                    disabled={saving}
                    onClick={() => onSelect(achievement)}
                />
            ))}
        </div>
    );
}

function IuinAchievementOrb({
    achievement,
    locked,
    selected,
    focused,
    dragging,
    disabled,
    draggable,
    onDragStart,
    onDragEnd,
    onClick,
}: {
    achievement: IuinAchievementItem;
    locked?: boolean;
    selected?: boolean;
    focused?: boolean;
    dragging?: boolean;
    disabled?: boolean;
    draggable?: boolean;
    onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
    onDragEnd?: () => void;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className={classNames('iuin-profile-achievement-orb', {
                'iuin-profile-achievement-orb--image': Boolean(getIuinHonorAssetUrl(achievement.iconStorageKey)),
                'iuin-profile-achievement-orb--locked': locked,
                'iuin-profile-achievement-orb--selected': selected,
                'iuin-profile-achievement-orb--focused': focused,
                'iuin-profile-achievement-orb--dragging': dragging,
            })}
            title={achievement.name}
            aria-label={achievement.name}
            aria-pressed={selected}
            disabled={disabled}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
        >
            <IuinAchievementArtwork achievement={achievement}/>
            {locked && <span className='iuin-profile-achievement-orb__lock'><i className='icon icon-lock-outline'/></span>}
        </button>
    );
}

function IuinAchievementDetailDialog({
    achievement,
    username,
    onClose,
}: {
    achievement: IuinAchievementItem;
    username?: string;
    onClose: () => void;
}) {
    const intl = useIntl();
    const {closing, requestClose} = useIuinHonorDialogExit(onClose);
    const assetUrl = getIuinHonorAssetUrl(achievement.iconStorageKey);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && !closing) {
            event.preventDefault();
            requestClose();
        }
    }, [closing, requestClose]);

    return (
        <div
            className={classNames('iuin-profile-entry-dialog__backdrop iuin-profile-achievement-detail__backdrop', {
                'iuin-profile-achievement-detail__backdrop--closing': closing,
            })}
        >
            <section
                className={classNames('iuin-profile-achievement-detail', {
                    'iuin-profile-achievement-detail--closing': closing,
                })}
                role='dialog'
                aria-modal='true'
                aria-labelledby='iuin-profile-achievement-detail-title'
                onKeyDown={handleKeyDown}
            >
                <div className='iuin-profile-achievement-detail__hero'>
                    <HonorActionIconButton
                        className='iuin-profile-achievement-detail__close'
                        label={intl.formatMessage({
                            id: 'iuin_profile.achievement_detail.close',
                            defaultMessage: 'Close achievement details',
                        })}
                        disabled={closing}
                        onClick={requestClose}
                    />
                    <span
                        className={classNames('iuin-profile-achievement-detail__icon', {
                            'iuin-profile-achievement-detail__icon--image': Boolean(assetUrl),
                        })}
                    >
                        <IuinAchievementArtwork achievement={achievement}/>
                    </span>
                </div>
                <div className='iuin-profile-achievement-detail__body'>
                    <h2 id='iuin-profile-achievement-detail-title'>{achievement.name}</h2>
                    <p>
                        {username ? `@${username} ${achievement.description}` : achievement.description}
                    </p>
                    {(achievement.category || achievement.rarity) && (
                        <div className='iuin-profile-achievement-detail__meta'>
                            {achievement.category && <span className='iuin-profile-achievement-detail__category'>{achievement.category}</span>}
                            {achievement.rarity && <IuinHonorRarityTag rarity={achievement.rarity}/>}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function HonorItemGrid<T extends IuinAchievementItem | IuinTitleItem | IuinAvatarFrameItem>({
    loading,
    items,
    selectedIds,
    saving,
    onToggle,
    singleSelect,
}: {
    loading: boolean;
    items: T[];
    selectedIds: string[];
    saving: boolean;
    onToggle: (item: T) => void;
    singleSelect?: boolean;
}) {
    const intl = useIntl();

    if (loading) {
        return (
            <p className='iuin-profile-honor-dialog__empty'>
                <FormattedMessage
                    id='iuin_profile.honors.loading'
                    defaultMessage='Loading honors...'
                />
            </p>
        );
    }

    return (
        <div className='iuin-profile-honor-dialog__grid'>
            {items.map((item) => {
                const selected = selectedIds.includes(item.id);
                const locked = !item.unlocked;
                const isAvatarFrame = 'frameStorageKey' in item;
                let stateIcon = singleSelect ? 'icon-radiobox-blank' : 'icon-checkbox-blank-outline';
                if (selected) {
                    stateIcon = 'icon-check';
                } else if (locked) {
                    stateIcon = 'icon-lock-outline';
                }
                let visual: React.ReactNode = <IuinAchievementArtwork achievement={item as IuinAchievementItem}/>;
                if (isAvatarFrame) {
                    visual = <IuinAvatarFramePreview frame={item as IuinAvatarFrameItem}/>;
                } else if (singleSelect) {
                    visual = <IuinTitleArtwork title={item as IuinTitleItem}/>;
                }

                return (
                    <button
                        key={item.id}
                        type='button'
                        className={classNames('iuin-profile-honor-card', {
                            'iuin-profile-honor-card--selected': selected,
                            'iuin-profile-honor-card--locked': locked,
                        })}
                        disabled={saving || locked}
                        aria-pressed={selected}
                        title={locked ? item.unlockHint : item.name}
                        onClick={() => onToggle(item)}
                    >
                        <span className='iuin-profile-honor-card__visual'>
                            {visual}
                        </span>
                        <span className='iuin-profile-honor-card__content'>
                            <strong>{item.name}</strong>
                            <span className='iuin-profile-honor-card__description'>{item.description}</span>
                            <span className='iuin-profile-honor-card__meta'>
                                <IuinHonorRarityTag
                                    rarity={item.rarity}
                                    compact={true}
                                />
                            </span>
                            {locked && (
                                <em>
                                    <i className='icon icon-lock-outline'/>
                                    {item.unlockHint || intl.formatMessage({
                                        id: 'iuin_profile.honors.locked',
                                        defaultMessage: 'Locked',
                                    })}
                                </em>
                            )}
                        </span>
                        <span className='iuin-profile-honor-card__state'>
                            <i className={classNames('icon', stateIcon)}/>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function IuinHonorDialogShell({
    titleId,
    title,
    eyebrow,
    saving,
    closing,
    saveDisabled,
    saveLabel,
    children,
    onClose,
    onSave,
}: {
    titleId: string;
    title: React.ReactNode;
    eyebrow: React.ReactNode;
    saving: boolean;
    closing: boolean;
    saveDisabled?: boolean;
    saveLabel?: React.ReactNode;
    children: React.ReactNode;
    onClose: () => void;
    onSave: () => void;
}) {
    const intl = useIntl();

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && !saving && !closing) {
            event.preventDefault();
            onClose();
        }
    }, [closing, onClose, saving]);

    return (
        <div
            className={classNames('iuin-profile-entry-dialog__backdrop iuin-profile-fields-dialog__backdrop iuin-profile-honor-dialog__backdrop', {
                'iuin-profile-honor-dialog__backdrop--closing': closing,
            })}
        >
            <section
                className={classNames('iuin-profile-entry-dialog iuin-profile-fields-dialog iuin-profile-honor-dialog', {
                    'iuin-profile-honor-dialog--saving': saving,
                    'iuin-profile-honor-dialog--closing': closing,
                })}
                role='dialog'
                aria-modal='true'
                aria-labelledby={titleId}
                onKeyDown={handleKeyDown}
            >
                <div className='iuin-profile-entry-dialog__header'>
                    <div>
                        <h2 id={titleId}>{title}</h2>
                        <span>{eyebrow}</span>
                    </div>
                    <HonorActionIconButton
                        className='iuin-profile-entry-dialog__close'
                        label={intl.formatMessage({
                            id: 'iuin_profile.editor.section_dialog_close',
                            defaultMessage: 'Close dialog',
                        })}
                        disabled={saving || closing}
                        onClick={onClose}
                    />
                </div>
                <div className='iuin-profile-fields-dialog__body iuin-profile-honor-dialog__body'>
                    {children}
                </div>
                <div className='iuin-profile-entry-dialog__actions iuin-profile-fields-dialog__actions'>
                    <button
                        type='button'
                        className='iuin-profile-button iuin-profile-button--subtle'
                        disabled={saving || closing}
                        onClick={onClose}
                    >
                        <FormattedMessage
                            id='iuin_profile.editor.cancel'
                            defaultMessage='Cancel'
                        />
                    </button>
                    <button
                        type='button'
                        className='iuin-profile-button'
                        disabled={saving || closing || saveDisabled}
                        onClick={onSave}
                    >
                        {saving ? (
                            <FormattedMessage
                                id='iuin_profile.editor.saving'
                                defaultMessage='Saving...'
                            />
                        ) : (
                            saveLabel || (
                                <FormattedMessage
                                    id='save_button.save'
                                    defaultMessage='Save'
                                />
                            )
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
}
