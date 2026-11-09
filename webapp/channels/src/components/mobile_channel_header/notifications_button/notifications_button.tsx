// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Link} from 'react-router-dom';

import BellOutlineIcon from '@mattermost/compass-icons/components/bell-outline';

type Props = {
    teamName: string;
    unreadMentionCount: number;
};

/**
 * The notification entry in the narrow channel header. It is the bottom bar's notification
 * destination on another surface: the same team wide mentions page and the same mention count,
 * so the entry keeps working exactly as it did while the bar existed (R4, R6). It wears the same
 * round button as search and the right sidebar toggle, so the header reads as one row of equal
 * controls, and the count caps at 99 the way the bar's badge did.
 */
const NotificationsButton = ({teamName, unreadMentionCount}: Props) => {
    const intl = useIntl();

    if (!teamName) {
        return null;
    }

    const label = intl.formatMessage({
        id: 'narrow_views.notifications',
        defaultMessage: 'Notifications',
    });

    return (
        <Link
            to={`/${teamName}/mentions`}
            className='navbar-toggle navbar-right__icon pull-right navbar-notifications'
            aria-label={unreadMentionCount > 0 ? `${label}, ${unreadMentionCount}` : label}
            title={label}
            data-testid='narrowNotificationsButton'
        >
            <BellOutlineIcon
                size={18}
                aria-hidden='true'
            />
            {unreadMentionCount > 0 && (
                <span className='badge badge-notify'>{unreadMentionCount > 99 ? '99+' : unreadMentionCount}</span>
            )}
        </Link>
    );
};

export default React.memo(NotificationsButton);
