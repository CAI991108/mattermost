// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import type {RouteComponentProps} from 'react-router-dom';

import {getUser, getUserByUsername} from 'mattermost-redux/actions/users';
import {getUserByUsername as selectUserByUsername, getUser as selectUser} from 'mattermost-redux/selectors/entities/users';

import {openDirectChannelToUserId} from 'actions/channel_actions';
import * as GlobalActions from 'actions/global_actions';
import {getHistory} from 'utils/browser_history';

import ChannelView from 'components/channel_view/index';

import {getDmDefaultTargetUserId} from 'selectors/direct_messages';

import type {GlobalState} from 'types/store';

type Props = RouteComponentProps<{identifier?: string}> & {
    channelsLoaded: boolean;
};

/**
 * DirectMessagesCenter handles rendering the DM conversation area.
 *
 * - No identifier → redirects to the best default DM target
 * - identifier = @username → resolves username to userId, opens DM
 *
 * Note: PostView's isChannelLoading has been patched to handle the case where
 * there is no `team` param (global DM route), so ChannelView can render immediately.
 */
export default function DirectMessagesCenter(props: Props) {
    const dispatch = useDispatch();
    const {identifier} = props.match.params;

    const defaultTargetUserId = useSelector(getDmDefaultTargetUserId);
    // Resolve default target userId to username for @username URL format
    const defaultTargetUser = useSelector((state: GlobalState) =>
        defaultTargetUserId ? selectUser(state, defaultTargetUserId) : undefined,
    );
    const lastOpenedIdentifier = useRef<string | null>(null);
    const defaultRedirectTarget = useRef<string | null>(null);

    // Selector for looking up user by username from redux state
    const username = identifier?.startsWith('@') ? identifier.slice(1).toLowerCase() : null;
    const userByUsername = useSelector((state: GlobalState) =>
        username ? selectUserByUsername(state, username) : undefined,
    );

    useEffect(() => {
        if (!identifier) {
            if (!props.channelsLoaded || !defaultTargetUserId) {
                return;
            }

            (async () => {
                let defaultUser = defaultTargetUser;
                if (!defaultUser) {
                    const result = await dispatch(getUser(defaultTargetUserId) as any);
                    if ('error' in result || !result.data) {
                        return;
                    }
                    defaultUser = result.data;
                }

                if (defaultUser?.username && defaultRedirectTarget.current !== defaultUser.username) {
                    defaultRedirectTarget.current = defaultUser.username;
                    getHistory().replace(`/direct_messages/@${defaultUser.username}`);
                }
            })();
            return;
        }

        // Avoid re-opening the same DM unnecessarily
        if (lastOpenedIdentifier.current === identifier) {
            return;
        }
        lastOpenedIdentifier.current = identifier;

        (async () => {
            let userId: string | undefined;

            if (identifier.startsWith('@')) {
                // @username format — resolve to userId
                const uname = identifier.slice(1).toLowerCase();
                let user = userByUsername;
                if (!user) {
                    const result = await dispatch(getUserByUsername(uname) as any);
                    if ('error' in result || !result.data) {
                        return;
                    }
                    user = result.data;
                }
                userId = user?.id;
            } else {
                // Plain userId format (fallback / legacy)
                userId = identifier;
            }

            if (!userId) {
                return;
            }

            const result = await dispatch(openDirectChannelToUserId(userId) as any);
            if (result && !('error' in result) && result.data) {
                GlobalActions.emitChannelClickEvent(result.data);
            }
        })();
    }, [identifier, props.channelsLoaded, defaultTargetUserId, defaultTargetUser, userByUsername, dispatch]);

    if (!identifier) {
        return null;
    }

    // key=identifier forces ChannelView to remount when switching between users
    return <ChannelView key={identifier}/>;
}
