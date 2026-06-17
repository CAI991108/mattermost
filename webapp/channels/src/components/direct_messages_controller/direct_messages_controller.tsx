// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {useSelector} from 'react-redux';
import type {RouteComponentProps} from 'react-router-dom';

import ResizableLhs from 'components/resizable_sidebar/resizable_lhs';

import {getIsLhsOpen} from 'selectors/lhs';
import {getIsRhsOpen} from 'selectors/rhs';

import DirectMessagesCenter from './direct_messages_center';
import DirectMessagesSidebar from './direct_messages_sidebar';

import './direct_messages_controller.scss';

type Props = RouteComponentProps<{identifier?: string}>;

/**
 * DirectMessagesController is the top-level layout for the /direct_messages route.
 * It reuses the native channel layout shells so ChannelView/RHS sizing behaves
 * the same as team channels.
 */
export default function DirectMessagesController(props: Props) {
    const lhsOpen = useSelector(getIsLhsOpen);
    const rhsOpen = useSelector(getIsRhsOpen);

    return (
        <>
            <ResizableLhs id='SidebarContainer'>
                <DirectMessagesSidebar/>
            </ResizableLhs>
            <div
                id='channel_view'
                className='channel-view'
                data-testid='channel_view'
            >
                <div className='container-fluid channel-view-inner'>
                    <div
                        className={classNames('inner-wrap', 'channel__wrap', {
                            'move--right': lhsOpen,
                            'move--left': rhsOpen,
                        })}
                    >
                        <div className='row main'>
                            <DirectMessagesCenter {...props}/>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
