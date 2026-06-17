// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback, useEffect} from 'react';
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

    // LZX: DM 频道隐藏成员 Tab，左侧联系人列表已承担通讯录职责
    const isDmChannel = channel?.type === 'D' || channel?.type === 'G';
    const visibleTabs = isDmChannel
        ? TABS.filter((tab) => tab.rhsState !== RHSStates.CHANNEL_MEMBERS)
        : TABS;

    // LZX: 如果当前是成员 Tab 但进入了 DM，自动切换到信息 Tab
    useEffect(() => {
        if (isDmChannel && rhsState === RHSStates.CHANNEL_MEMBERS && channel) {
            dispatch(showChannelInfo(channel.id));
        }
    }, [isDmChannel, rhsState, channel, dispatch]);

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
            {visibleTabs.map((tab) => {
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
