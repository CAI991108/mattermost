// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {useIntl} from 'react-intl';
import {Link, useLocation} from 'react-router-dom';

import {AccountOutlineIcon, BellOutlineIcon, MessageTextOutlineIcon} from '@mattermost/compass-icons/components';

import NotifyCounts from 'components/notify_counts/notify_counts';

import useKeyboardYield from './use_keyboard_yield';

import type {PropsFromRedux} from './index';

import './bottom_navigation.scss';

export type EntryId = 'chat' | 'notifications' | 'me';

function escapeForRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeSegment(segment: string) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * The entry an address belongs to is derived from the address itself, so no new state
 * tracks the current entry (KTD1) and an address with no entry stays unselected (R3).
 * The profile rule runs before the team guard: that route renders without a current team.
 */
export function getSelectedEntry(pathname: string, teamName: string, currentUsername: string): EntryId | null {
    const profileMatch = pathname.match(/^\/u\/([^/]+)/);
    if (profileMatch) {
        return currentUsername && decodeSegment(profileMatch[1]) === currentUsername ? 'me' : null;
    }

    if (pathname.startsWith('/direct_messages/')) {
        return 'chat';
    }

    if (!teamName) {
        return null;
    }

    const team = escapeForRegex(teamName);

    if (new RegExp(`^/${team}/mentions/?$`).test(pathname)) {
        return 'notifications';
    }

    if (new RegExp(`^/${team}/(channels|messages)(/|$)`).test(pathname)) {
        return 'chat';
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

    const selected = getSelectedEntry(pathname, props.teamName, props.currentUsername);

    const mentionCountLabel = props.unreadMentionCount > 0 ? `, ${props.unreadMentionCount} ${formatMessage({
        id: props.unreadMentionCount === 1 ? 'accessibility.sidebar.types.mention' : 'accessibility.sidebar.types.mentions',
        defaultMessage: props.unreadMentionCount === 1 ? 'mention' : 'mentions',
    })}` : '';

    // The label stays plain text so the count cannot leak into it: the number lives in the
    // badge and in the accessible name only (R12).
    const entries = [{
        id: 'chat' as EntryId,
        to: props.teamName ? `/${props.teamName}/channels` : '',
        label: formatMessage({id: 'bottom_navigation.chat', defaultMessage: 'Chat'}),
        icon: <MessageTextOutlineIcon/>,
        count: 0,
    }, {
        id: 'notifications' as EntryId,
        to: props.teamName ? `/${props.teamName}/mentions` : '',
        label: formatMessage({id: 'bottom_navigation.notifications', defaultMessage: 'Notifications'}),
        icon: <BellOutlineIcon/>,
        count: props.unreadMentionCount,
    }, {
        id: 'me' as EntryId,
        to: props.currentUsername ? `/u/${props.currentUsername}` : '',
        label: formatMessage({id: 'bottom_navigation.me', defaultMessage: 'Me'}),
        icon: <AccountOutlineIcon/>,
        count: 0,
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
                        aria-label={`${entry.label}${entry.count > 0 ? mentionCountLabel : ''}`}
                        data-testid={`bottomNavigationEntry-${entry.id}`}
                    >
                        <span className='bottom-navigation__icon'>
                            {entry.icon}
                            <NotifyCounts unreadMentionCount={entry.count}/>
                        </span>
                        <span className='bottom-navigation__label'>
                            {entry.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
