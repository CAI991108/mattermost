// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Link} from 'react-router-dom';

import AccountOutlineIcon from '@mattermost/compass-icons/components/account-outline';
import ChevronRightIcon from '@mattermost/compass-icons/components/chevron-right';

type Props = {
    username: string;
};

/**
 * The way into the user's own profile once the bottom bar is gone. It is the drawer's last row,
 * under the channel list, so it is always in reach while the drawer is open and takes nothing
 * from the channel list above it (R12, R13). The profile page itself is unchanged.
 */
const NarrowProfileRow = ({username}: Props) => {
    const intl = useIntl();

    if (!username) {
        return null;
    }

    return (
        <Link
            to={`/u/${username}`}
            className='narrow-profile-row'
            aria-label={intl.formatMessage({
                id: 'narrow_views.open_profile',
                defaultMessage: 'Open your profile',
            })}
            data-testid='narrowProfileRow'
        >
            <span className='narrow-profile-row__icon'>
                <AccountOutlineIcon size={24}/>
            </span>
            <span className='narrow-profile-row__label'>
                {intl.formatMessage({
                    id: 'narrow_views.view_profile',
                    defaultMessage: 'View profile',
                })}
            </span>
            <ChevronRightIcon size={16}/>
        </Link>
    );
};

export default React.memo(NarrowProfileRow);
