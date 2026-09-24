// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {useIntl} from 'react-intl';
import {Link, useLocation} from 'react-router-dom';

import {AccountMultipleOutlineIcon, BellOutlineIcon, GlobeIcon, MessageTextOutlineIcon} from '@mattermost/compass-icons/components';

import NotifyCounts from 'components/notify_counts/notify_counts';

import useKeyboardYield from './use_keyboard_yield';

import type {PropsFromRedux} from './index';

import './bottom_navigation.scss';

export type EntryId = 'messages' | 'channels' | 'members' | 'notifications';

function escapeForRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The entry an address belongs to is derived from the address itself, so no new state
 * tracks the current entry (KTD2) and an address with no entry stays unselected (R15).
 */
export function getSelectedEntry(pathname: string, teamName: string): EntryId | null {
    if (pathname.startsWith('/direct_messages/')) {
        return 'messages';
    }

    if (!teamName) {
        return null;
    }

    const team = escapeForRegex(teamName);

    if (new RegExp(`^/${team}/channels/[^/]+/members/?$`).test(pathname)) {
        return 'members';
    }

    if (new RegExp(`^/${team}/channels/[^/]+/mentions/?$`).test(pathname)) {
        return 'notifications';
    }

    if (new RegExp(`^/${team}/channels/?$`).test(pathname)) {
        return 'channels';
    }

    if (new RegExp(`^/${team}/(channels|messages)/[^/]+`).test(pathname)) {
        return 'messages';
    }

    return null;
}

export default function BottomNavigation(props: PropsFromRedux) {
    const {formatMessage} = useIntl();
    const {pathname} = useLocation();
    const keyboardYield = useKeyboardYield();

    if (!props.isMobileView) {
        return null;
    }

    const selected = getSelectedEntry(pathname, props.teamName);

    const mentionCountLabel = props.unreadMentionCount > 0 ? `, ${props.unreadMentionCount} ${formatMessage({
        id: props.unreadMentionCount === 1 ? 'accessibility.sidebar.types.mention' : 'accessibility.sidebar.types.mentions',
        defaultMessage: props.unreadMentionCount === 1 ? 'mention' : 'mentions',
    })}` : '';

    const entries = [{
        id: 'messages' as EntryId,
        to: props.messagesPath,
        label: formatMessage({id: 'bottom_navigation.messages', defaultMessage: 'Messages'}),
        icon: <MessageTextOutlineIcon/>,
        count: 0,
    }, {
        id: 'channels' as EntryId,
        to: `/${props.teamName}/channels`,
        label: formatMessage({id: 'bottom_navigation.channels', defaultMessage: 'Channels'}),
        icon: <GlobeIcon/>,
        count: 0,
    }, {
        id: 'members' as EntryId,
        to: props.channelName ? `/${props.teamName}/channels/${props.channelName}/members` : `/${props.teamName}/channels`,
        label: formatMessage({id: 'bottom_navigation.members', defaultMessage: 'Members'}),
        icon: <AccountMultipleOutlineIcon/>,
        count: 0,
    }, {
        id: 'notifications' as EntryId,
        to: props.channelName ? `/${props.teamName}/channels/${props.channelName}/mentions` : `/${props.teamName}/channels`,
        label: `${formatMessage({id: 'bottom_navigation.notifications', defaultMessage: 'Notifications'})}${mentionCountLabel}`,
        icon: <BellOutlineIcon/>,
        count: props.unreadMentionCount,
    }];

    return (
        <nav
            className={classNames('bottom-navigation', {
                'bottom-navigation--yielded': props.lhsOpen,
                'bottom-navigation--keyboard': keyboardYield,
            })}
            aria-label={formatMessage({id: 'bottom_navigation.ariaLabel', defaultMessage: 'Narrow screen navigation'})}
            data-testid='bottomNavigation'
        >
            {entries.map((entry) => {
                const isSelected = entry.id === selected;

                return (
                    <Link
                        key={entry.id}
                        to={entry.to}
                        className={classNames('bottom-navigation__entry', {'bottom-navigation__entry--selected': isSelected})}
                        aria-current={isSelected ? 'page' : undefined}
                        aria-label={entry.label}
                        data-testid={`bottomNavigationEntry-${entry.id}`}
                    >
                        <span className='bottom-navigation__icon'>
                            {entry.icon}
                        </span>
                        <span className='bottom-navigation__label'>
                            {entry.label}
                        </span>
                        <NotifyCounts unreadMentionCount={entry.count}/>
                    </Link>
                );
            })}
        </nav>
    );
}
