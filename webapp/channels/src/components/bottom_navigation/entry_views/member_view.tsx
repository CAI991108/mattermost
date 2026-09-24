// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import ChannelMembersRHS from 'components/channel_members_rhs';

import './entry_views.scss';

/**
 * The member list the "members" entry leads to. It is the first level content of the entry,
 * not a panel: the right-hand panel is suppressed there so the same list is never rendered
 * twice (KTD8).
 */
export default function MemberView() {
    return (
        <div
            className='entry-view member-view'
            data-testid='memberView'
        >
            <div className='entry-view__header'>
                <span className='entry-view__title'>
                    <FormattedMessage
                        id='bottom_navigation.members'
                        defaultMessage='Members'
                    />
                </span>
            </div>
            <div className='entry-view__body'>
                <ChannelMembersRHS/>
            </div>
        </div>
    );
}
