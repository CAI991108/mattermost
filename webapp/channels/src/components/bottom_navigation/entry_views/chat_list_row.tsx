// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AccountMultipleOutlineIcon, AccountOutlineIcon, BellOffOutlineIcon, GlobeIcon} from '@mattermost/compass-icons/components';
import classNames from 'classnames';
import React from 'react';
import {useIntl} from 'react-intl';
import {Link} from 'react-router-dom';

import type {ChatListEntry} from 'selectors/chat_list';

import './entry_views.scss';

type Props = {
    entry: ChatListEntry;
};

function EntryIcon({kind}: {kind: ChatListEntry['kind']}) {
    if (kind === 'channel') {
        return <GlobeIcon size={16}/>;
    }

    if (kind === 'group') {
        return <AccountMultipleOutlineIcon size={16}/>;
    }

    return <AccountOutlineIcon size={16}/>;
}

/**
 * One conversation in the mixed chat list. A muted conversation shows its marker but keeps its
 * place and keeps the row itself, and the mention count is a label on top of the row rather than
 * part of the name, so the name stays readable (R8, KTD2).
 */
export default function ChatListRow({entry}: Props) {
    const {formatMessage} = useIntl();
    const mutedLabel = formatMessage({id: 'bottom_navigation.chat.muted', defaultMessage: 'Muted'});

    return (
        <Link
            to={entry.path}
            className={classNames('chat-list-row', {
                'chat-list-row--muted': entry.muted,
            })}
            data-testid={`chatListRow-${entry.kind}-${entry.id}`}
        >
            <span
                className='chat-list-row__icon'
                aria-hidden='true'
            >
                <EntryIcon kind={entry.kind}/>
            </span>
            <span className='chat-list-row__name'>{entry.displayName}</span>
            {entry.muted && (
                <span
                    className='chat-list-row__muted'
                    role='img'
                    aria-label={mutedLabel}
                    title={mutedLabel}
                >
                    <BellOffOutlineIcon size={14}/>
                </span>
            )}
            {entry.unreadMentions > 0 && (
                <span className='chat-list-row__badge'>
                    {entry.unreadMentions > 99 ? '99+' : entry.unreadMentions}
                </span>
            )}
        </Link>
    );
}
