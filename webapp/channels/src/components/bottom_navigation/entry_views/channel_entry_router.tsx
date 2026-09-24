// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {useDispatch} from 'react-redux';
import type {RouteComponentProps} from 'react-router-dom';

import {onChannelByIdentifierEnter} from 'components/channel_layout/channel_identifier_router/actions';

export type EntryRouteParams = {
    identifier: string;
    team: string;
    path?: string;
};

type Props = RouteComponentProps<EntryRouteParams> & {
    children: React.ReactNode;
};

/**
 * Entry views live in the team/channel route tree and their addresses carry the channel
 * identifier, so opening or refreshing one initializes the same channel context the
 * message view initializes before the entry view renders (KTD2).
 */
export default function ChannelEntryRouter({children, match, history}: Props) {
    const dispatch = useDispatch();
    const {identifier, team} = match.params;

    useEffect(() => {
        dispatch(onChannelByIdentifierEnter({match, history}));
    }, [dispatch, identifier, team, match, history]);

    return <>{children}</>;
}
