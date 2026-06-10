// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';

import {showChannelInfo, showChannelMembers, showPinnedPosts, showChannelFiles} from 'actions/views/rhs';
import {getRhsState} from 'selectors/rhs';

import {WithTooltip} from '@mattermost/shared/components/tooltip';

import {RHSStates} from 'utils/constants';

import type {RhsState} from 'types/store/rhs';

import './rhs_tab_bar.scss';

interface TabItem {
    id: string;
    icon: string;
    rhsState: RhsState;
    labelId: string;
    defaultLabel: string;
}

const TABS: TabItem[] = [
    {
        id: 'rhs-tab-members',
        icon: 'icon-account-outline',
        rhsState: RHSStates.CHANNEL_MEMBERS,
        labelId: 'rhs_tab_bar.members',
        defaultLabel: 'Members',
    },
    {
        id: 'rhs-tab-info',
        icon: 'icon-information-outline',
        rhsState: RHSStates.CHANNEL_INFO,
        labelId: 'rhs_tab_bar.info',
        defaultLabel: 'Channel Info',
    },
    {
        id: 'rhs-tab-pinned',
        icon: 'icon-pin-outline',
        rhsState: RHSStates.PIN,
        labelId: 'rhs_tab_bar.pinned',
        defaultLabel: 'Pinned Messages',
    },
    {
        id: 'rhs-tab-files',
        icon: 'icon-file-text-outline',
        rhsState: RHSStates.CHANNEL_FILES,
        labelId: 'rhs_tab_bar.files',
        defaultLabel: 'Files',
    },
];

const RhsTabBar = () => {
    const dispatch = useDispatch();
    const {formatMessage} = useIntl();
    const rhsState = useSelector(getRhsState);
    const channel = useSelector(getCurrentChannel);

    const handleTabClick = useCallback((tab: TabItem) => {
        if (!channel) {
            return;
        }
        switch (tab.rhsState) {
        case RHSStates.CHANNEL_MEMBERS:
            dispatch(showChannelMembers(channel.id));
            break;
        case RHSStates.CHANNEL_INFO:
            dispatch(showChannelInfo(channel.id));
            break;
        case RHSStates.PIN:
            dispatch(showPinnedPosts(channel.id));
            break;
        case RHSStates.CHANNEL_FILES:
            dispatch(showChannelFiles(channel.id));
            break;
        }
    }, [channel, dispatch]);

    return (
        <div className='rhs-tab-bar'>
            {TABS.map((tab) => {
                const isActive = rhsState === tab.rhsState;
                const label = formatMessage({id: tab.labelId, defaultMessage: tab.defaultLabel});
                return (
                    <WithTooltip
                        key={tab.id}
                        title={label}
                        placement='left'
                    >
                        <button
                            id={tab.id}
                            className={classNames('rhs-tab-bar__button', {
                                'rhs-tab-bar__button--active': isActive,
                            })}
                            onClick={() => handleTabClick(tab)}
                            aria-label={label}
                            aria-pressed={isActive}
                        >
                            <i className={classNames('icon', tab.icon)}/>
                        </button>
                    </WithTooltip>
                );
            })}
        </div>
    );
};

export default RhsTabBar;
