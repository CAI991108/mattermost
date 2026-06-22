// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {MessageDescriptor} from 'react-intl';
import {FormattedMessage, defineMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {useRouteMatch} from 'react-router-dom';

import {GenericModal} from '@mattermost/components';
import type {Emoji} from '@mattermost/types/emojis';
import type {UserCustomStatus} from '@mattermost/types/users';
import {CustomStatusDuration} from '@mattermost/types/users';

import {createCustomEmoji} from 'mattermost-redux/actions/emojis';
import {setCustomStatusInitialisationState} from 'mattermost-redux/actions/preferences';
import {setCustomStatus, unsetCustomStatus} from 'mattermost-redux/actions/users';
import {Preferences} from 'mattermost-redux/constants';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {loadCustomEmojisForRecentCustomStatuses} from 'actions/emoji_actions';
import {closeModal} from 'actions/views/modals';
import {makeGetCustomStatus, showStatusDropdownPulsatingDot, isCustomStatusExpired} from 'selectors/views/custom_status';

import RenderEmoji from 'components/emoji/render_emoji';
import useEmojiPicker from 'components/emoji_picker/use_emoji_picker';
import EmojiIcon from 'components/widgets/icons/emoji_icon';

import {Constants, ModalIdentifiers} from 'utils/constants';
import {isKeyPressed} from 'utils/keyboard';

import type {GlobalState} from 'types/store';

import 'components/category_modal.scss';
import './custom_status.scss';

type Props = {
    onExited: () => void;
};

const CUSTOM_STATUS_TEXT_CHARACTER_LIMIT = 80;
const CUSTOM_STATUS_IMAGE_SIZE_LIMIT = 512 * 1024;
const CUSTOM_STATUS_EMOJI_NAME_LIMIT = 64;

type DefaultUserCustomStatus = {
    emoji: string;
    message: MessageDescriptor;
    duration: CustomStatusDuration;
};

const {
    DONT_CLEAR,
} = CustomStatusDuration;

const githubStatusSuggestions: DefaultUserCustomStatus[] = [
    {
        emoji: 'palm_tree',
        message: defineMessage({
            id: 'custom_status.suggestions.on_vacation',
            defaultMessage: 'On vacation',
        }),
        duration: DONT_CLEAR,
    },
    {
        emoji: 'sneezing_face',
        message: defineMessage({
            id: 'custom_status.suggestions.out_sick',
            defaultMessage: 'Out sick',
        }),
        duration: DONT_CLEAR,
    },
    {
        emoji: 'house',
        message: defineMessage({
            id: 'custom_status.suggestions.working_from_home',
            defaultMessage: 'Working from home',
        }),
        duration: DONT_CLEAR,
    },
    {
        emoji: 'dart',
        message: defineMessage({
            id: 'custom_status.suggestions.focusing',
            defaultMessage: 'Focusing',
        }),
        duration: DONT_CLEAR,
    },
];

function createStatusEmojiName(filename: string): string {
    const suffix = Date.now().toString(36);
    const baseName = filename.
        replace(/\.[^/.]+$/, '').
        toLowerCase().
        replace(/[^a-z0-9_+-]+/g, '_').
        replace(/^_+|_+$/g, '') || 'image';
    const prefix = `status_${suffix}_`;
    const name = `${prefix}${baseName}`.slice(0, CUSTOM_STATUS_EMOJI_NAME_LIMIT).replace(/[_+-]+$/g, '');

    return name || `status_${suffix}`;
}

const CustomStatusModal: React.FC<Props> = (props: Props) => {
    const getCustomStatus = useMemo(makeGetCustomStatus, []);
    const dispatch = useDispatch();
    const currentCustomStatus = useSelector(getCustomStatus);
    const customStatusExpired = useSelector((state: GlobalState) => isCustomStatusExpired(state, currentCustomStatus));
    const {formatMessage} = useIntl();
    const currentUserId = useSelector(getCurrentUserId);
    const isCurrentCustomStatusSet = !customStatusExpired && (currentCustomStatus?.text || currentCustomStatus?.emoji);
    const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
    const [text, setText] = useState<string>(isCurrentCustomStatusSet ? currentCustomStatus?.text : '');
    const [emoji, setEmoji] = useState<string>(isCurrentCustomStatusSet ? currentCustomStatus?.emoji : '');
    const [imageUploadError, setImageUploadError] = useState<string>('');
    const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
    const statusImageInputRef = useRef<HTMLInputElement | null>(null);
    const isStatusSet = Boolean(emoji || text);
    const firstTimeModalOpened = useSelector(showStatusDropdownPulsatingDot);
    const inCustomEmojiPath = useRouteMatch('/:team/emoji');

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (isKeyPressed(event, Constants.KeyCodes.ESCAPE)) {
            props.onExited();
        }
    }, [props.onExited]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    const handleCustomStatusInitializationState = () => {
        if (firstTimeModalOpened) {
            dispatch(setCustomStatusInitialisationState({[Preferences.CUSTOM_STATUS_MODAL_VIEWED]: true}));
        }
    };

    const loadCustomEmojisForRecentStatuses = () => {
        dispatch(loadCustomEmojisForRecentCustomStatuses());
    };

    const handleStatusExpired = () => {
        if (customStatusExpired && currentCustomStatus) {
            dispatch(unsetCustomStatus());
        }
    };

    useEffect(() => {
        handleCustomStatusInitializationState();
        loadCustomEmojisForRecentStatuses();
        handleStatusExpired();
    }, []);

    useEffect(() => {
        if (inCustomEmojiPath) {
            dispatch(closeModal(ModalIdentifiers.CUSTOM_STATUS));
        }
    }, [dispatch, inCustomEmojiPath]);

    const handleSetStatus = () => {
        const customStatus: UserCustomStatus = {
            emoji: emoji || 'speech_balloon',
            text: text.trim(),
            duration: DONT_CLEAR,
        };
        dispatch(setCustomStatus(customStatus));
        dispatch(closeModal(ModalIdentifiers.CUSTOM_STATUS));
    };

    const handleEnterKeyPressed = useCallback(() => {
        handleSetStatus();
    }, [handleSetStatus]);

    function clearHandle() {
        setEmoji('');
        setText('');
    }

    const handleClearStatus = () => {
        if (isCurrentCustomStatusSet) {
            dispatch(unsetCustomStatus());
        }
        clearHandle();
    };

    const handleEmojiClick = (selectedEmoji: Emoji) => {
        setShowEmojiPicker(false);
        const emojiName = ('short_name' in selectedEmoji) ? selectedEmoji.short_name : selectedEmoji.name;
        setEmoji(emojiName);
    };

    const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => setText(event.target.value);

    const handleStatusImageButtonClick = () => {
        statusImageInputRef.current?.click();
    };

    const handleStatusImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            setImageUploadError(formatMessage({
                id: 'custom_status.image_upload_type_error',
                defaultMessage: 'Upload a PNG, JPG, GIF, or WebP image.',
            }));
            return;
        }

        if (file.size > CUSTOM_STATUS_IMAGE_SIZE_LIMIT) {
            setImageUploadError(formatMessage({
                id: 'custom_status.image_upload_size_error',
                defaultMessage: 'Status emoji images must be less than 512 KiB.',
            }));
            return;
        }

        if (!currentUserId) {
            setImageUploadError(formatMessage({
                id: 'custom_status.image_upload_failed',
                defaultMessage: 'Could not import the image as an emoji.',
            }));
            return;
        }

        setIsUploadingImage(true);
        setImageUploadError('');

        const emojiName = createStatusEmojiName(file.name);
        try {
            const result = await dispatch(createCustomEmoji({
                creator_id: currentUserId,
                name: emojiName,
            }, file) as any) as any;

            if (result.error) {
                setImageUploadError(result.error.message || formatMessage({
                    id: 'custom_status.image_upload_failed',
                    defaultMessage: 'Could not import the image as an emoji.',
                }));
                return;
            }

            setEmoji(result.data?.name || emojiName);
            setShowEmojiPicker(false);
        } catch {
            setImageUploadError(formatMessage({
                id: 'custom_status.image_upload_failed',
                defaultMessage: 'Could not import the image as an emoji.',
            }));
        } finally {
            setIsUploadingImage(false);
        }
    }, [currentUserId, dispatch, formatMessage]);

    const customStatusEmoji = emoji || text ? (
        <RenderEmoji
            emojiName={emoji || 'speech_balloon'}
            size={20}
        />
    ) : <EmojiIcon className={'icon icon--emoji'}/>;

    const {
        emojiPicker,
        getReferenceProps,
        setReference,
    } = useEmojiPicker({
        showEmojiPicker,
        setShowEmojiPicker,

        customEmojiButtonDisabled: isUploadingImage,
        customEmojiButtonLabel: (
            <>
                <i
                    className={classNames('icon', {
                        'icon-upload-outline': !isUploadingImage,
                        'icon-loading icon-spin': isUploadingImage,
                    })}
                    aria-hidden='true'
                />
                <FormattedMessage
                    id='custom_status.upload_emoji'
                    defaultMessage='Upload Emoji'
                />
            </>
        ),
        onAddCustomEmojiClick: handleStatusImageButtonClick,
        onEmojiClick: handleEmojiClick,
    });

    const handleSuggestionClick = (status: UserCustomStatus) => {
        setEmoji(status.emoji);
        setText(status.text);
    };

    const disableSetStatus = !isStatusSet || text.length > CUSTOM_STATUS_TEXT_CHARACTER_LIMIT;
    const remainingCharacters = CUSTOM_STATUS_TEXT_CHARACTER_LIMIT - text.length;

    const suggestionChips = (
        <div className='StatusModal__suggestions'>
            {githubStatusSuggestions.map((status) => {
                const suggestionText = formatMessage(status.message);
                return (
                    <button
                        key={status.emoji}
                        type='button'
                        className='StatusModal__suggestion-chip'
                        onClick={() => handleSuggestionClick({
                            emoji: status.emoji,
                            text: suggestionText,
                            duration: status.duration,
                        })}
                    >
                        <RenderEmoji
                            emojiName={status.emoji}
                            size={16}
                        />
                        <span>{suggestionText}</span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <GenericModal
            enforceFocus={false}
            onExited={props.onExited}
            compassDesign={true}
            modalHeaderText={
                <FormattedMessage
                    id='custom_status.edit_status'
                    defaultMessage='Edit status'
                />
            }
            confirmButtonText={
                <FormattedMessage
                    id='custom_status.modal_set_status'
                    defaultMessage='Set status'
                />
            }
            cancelButtonText={
                <FormattedMessage
                    id='custom_status.modal_clear_status'
                    defaultMessage='Clear status'
                />
            }
            isConfirmDisabled={disableSetStatus}
            id='custom_status_modal'
            className={'StatusModal'}
            handleConfirm={handleSetStatus}
            handleEnterKeyPress={handleEnterKeyPressed}
            handleCancel={handleClearStatus}
            ariaLabel={formatMessage({id: 'custom_status.edit_status', defaultMessage: 'Edit status'})}
            keyboardEscape={false}
            tabIndex={-1}
            autoCloseOnConfirmButton={false}
        >
            <div className='StatusModal__body'>
                <div className='StatusModal__section'>
                    <label
                        className='StatusModal__label'
                        htmlFor='custom_status_text'
                    >
                        <FormattedMessage
                            id='custom_status.whats_happening'
                            defaultMessage="What's happening"
                        />
                    </label>
                    <div className='StatusModal__input-row'>
                        <div className='StatusModal__emoji-container'>
                            <button
                                type='button'
                                ref={setReference}
                                aria-label={formatMessage({id: 'emoji_picker.emojiPicker.button.ariaLabel', defaultMessage: 'select an emoji'})}
                                className={classNames('emoji-picker__container', 'StatusModal__emoji-button', {
                                    'StatusModal__emoji-button--active': showEmojiPicker,
                                })}
                                {...getReferenceProps()}
                            >
                                {customStatusEmoji}
                            </button>
                            {emojiPicker}
                        </div>
                        <div className='StatusModal__text-wrap'>
                            <input
                                id='custom_status_text'
                                className='StatusModal__text-input form-control'
                                value={text}
                                maxLength={CUSTOM_STATUS_TEXT_CHARACTER_LIMIT}
                                onChange={handleTextChange}
                                placeholder={formatMessage({id: 'custom_status.set_status_placeholder', defaultMessage: 'Set a status'})}
                                autoFocus={true}
                            />
                            <input
                                ref={statusImageInputRef}
                                className='StatusModal__image-input'
                                type='file'
                                accept='image/png,image/jpeg,image/gif,image/webp,image/*'
                                onChange={handleStatusImageUpload}
                                hidden={true}
                                aria-hidden={true}
                                tabIndex={-1}
                            />
                        </div>
                    </div>
                    <div className='StatusModal__remaining'>
                        <FormattedMessage
                            id='custom_status.characters_remaining'
                            defaultMessage='{count, number} characters remaining'
                            values={{count: remainingCharacters}}
                        />
                    </div>
                    {imageUploadError && (
                        <div
                            className='StatusModal__upload-error'
                            role='alert'
                        >
                            {imageUploadError}
                        </div>
                    )}
                    {suggestionChips}
                </div>
            </div>
        </GenericModal >
    );
};

export default CustomStatusModal;
