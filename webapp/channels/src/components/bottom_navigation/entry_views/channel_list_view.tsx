// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useMemo, useRef, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {openModal} from 'actions/views/modals';
import BrowseChannels from 'components/browse_channels';
import TeamSwitcher from 'components/team_sidebar/team_switcher';
import {getChatListEntries} from 'selectors/chat_list';
import Constants, {ModalIdentifiers} from 'utils/constants';
import * as Keyboard from 'utils/keyboard';

import ChatListRow from './chat_list_row';

import './entry_views.scss';

const CHAT_FILTERS = ['all', 'channels', 'direct'] as const;

type ChatFilter = typeof CHAT_FILTERS[number];

const FILTER_LABELS: Record<ChatFilter, JSX.Element> = {
    all: (
        <FormattedMessage
            id='bottom_navigation.chatFilter.all'
            defaultMessage='All'
        />
    ),
    channels: (
        <FormattedMessage
            id='bottom_navigation.chatFilter.channels'
            defaultMessage='Channels'
        />
    ),
    direct: (
        <FormattedMessage
            id='bottom_navigation.chatFilter.direct'
            defaultMessage='Direct messages'
        />
    ),
};

/**
 * The page the "chat" entry leads to. Unlike the sidebar it is one recency ordered list of every
 * conversation - channels, direct messages and group messages mixed - because the narrow shell has
 * one column and the entry means "my conversations", not "my channels" (R7, KTD2). The three
 * filters only narrow that one list; the team switcher stays where it was (R9).
 */
export default function ChannelListView() {
    const dispatch = useDispatch();
    const {formatMessage} = useIntl();
    const entries = useSelector(getChatListEntries);
    const [filter, setFilter] = useState<ChatFilter>('all');
    const tabRefs = useRef<Record<ChatFilter, HTMLButtonElement | null>>({
        all: null,
        channels: null,
        direct: null,
    });

    const visible = useMemo(() => {
        if (filter === 'channels') {
            return entries.filter((entry) => entry.kind === 'channel');
        }

        if (filter === 'direct') {
            return entries.filter((entry) => entry.kind !== 'channel');
        }

        return entries;
    }, [entries, filter]);

    const showBrowseChannels = () => {
        dispatch(openModal({
            modalId: ModalIdentifiers.MORE_CHANNELS,
            dialogType: BrowseChannels,
        }));
    };

    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: ChatFilter) => {
        const goingRight = Keyboard.isKeyPressed(event, Constants.KeyCodes.RIGHT);
        if (!goingRight && !Keyboard.isKeyPressed(event, Constants.KeyCodes.LEFT)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const step = goingRight ? 1 : CHAT_FILTERS.length - 1;
        const next = CHAT_FILTERS[(CHAT_FILTERS.indexOf(current) + step) % CHAT_FILTERS.length];

        setFilter(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <div
            className='entry-view chat-list-view'
            data-testid='chatListView'
        >
            <div className='entry-view__header'>
                <span className='entry-view__title'>
                    <FormattedMessage
                        id='bottom_navigation.chat'
                        defaultMessage='Chat'
                    />
                </span>
                <TeamSwitcher/>
            </div>
            <div
                className='chat-list__filters'
                role='tablist'
                aria-label={formatMessage({
                    id: 'bottom_navigation.chatFilter.label',
                    defaultMessage: 'Chat list filters',
                })}
            >
                {CHAT_FILTERS.map((value) => {
                    const isSelected = value === filter;

                    return (
                        <button
                            key={value}
                            ref={(element) => {
                                tabRefs.current[value] = element;
                            }}
                            type='button'
                            role='tab'
                            aria-selected={isSelected}
                            tabIndex={isSelected ? 0 : -1}
                            className={classNames('chat-list__filter', {
                                'chat-list__filter--selected': isSelected,
                            })}
                            onClick={() => setFilter(value)}
                            onKeyDown={(event) => handleTabKeyDown(event, value)}
                            data-testid={`chatFilter-${value}`}
                        >
                            {FILTER_LABELS[value]}
                        </button>
                    );
                })}
            </div>
            <div className='entry-view__body chat-list__body'>
                {visible.length === 0 ? (
                    <p
                        className='chat-list__empty'
                        data-testid='chatListEmpty'
                    >
                        <FormattedMessage
                            id='bottom_navigation.chat.empty'
                            defaultMessage='No conversations here yet.'
                        />
                    </p>
                ) : (
                    visible.map((entry) => (
                        <ChatListRow
                            key={entry.id}
                            entry={entry}
                        />
                    ))
                )}
                <button
                    type='button'
                    className='chat-list__browse'
                    onClick={showBrowseChannels}
                    data-testid='chatListBrowseChannels'
                >
                    <FormattedMessage
                        id='more_channels.title'
                        defaultMessage='Browse Channels'
                    />
                </button>
            </div>
        </div>
    );
}
