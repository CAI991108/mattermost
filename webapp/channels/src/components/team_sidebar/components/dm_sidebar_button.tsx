// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useHistory, useRouteMatch} from 'react-router-dom';

import {WithTooltip} from '@mattermost/shared/components/tooltip';

import TeamIcon from 'components/widgets/team_icon/team_icon';

import './dm_sidebar_button.scss';

type Props = {
    unreadCount: number;
};

const DM_ICON = (
    <i
        className='icon icon-send dm-sidebar-button__icon'
        aria-hidden={true}
    />
);

/**
 * DmSidebarButton — the global DM entry in TeamSidebar.
 * Fixed at the top, not draggable, not part of the team list.
 * Shows a blue dot when there are unread DMs.
 */
export default function DmSidebarButton({unreadCount}: Props) {
    const history = useHistory();
    const isActive = Boolean(useRouteMatch('/direct_messages'));

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        history.push('/direct_messages');
    }, [history]);

    const hasUnread = unreadCount > 0;
    const teamClass = isActive ? 'active' : (hasUnread ? 'unread' : '');

    return (
        <div className='dm-sidebar-button-wrapper'>
            <WithTooltip
                title='私信'
                placement='right'
            >
                <a
                    href='/direct_messages'
                    className={`team-btn dm-sidebar-button${isActive ? ' active' : ''}`}
                    onClick={handleClick}
                    aria-label='私信'
                    data-testid='dm-sidebar-button'
                >
                    <TeamIcon
                        className={teamClass}
                        withHover={true}
                        content={DM_ICON}
                        url={null}
                    />
                    {hasUnread && (
                        <span className='badge badge-max-number pull-right small dm-sidebar-button__unread-badge'>
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </a>
            </WithTooltip>
        </div>
    );
}
