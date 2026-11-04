// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {lazy} from 'react';
import {Route, Switch, Redirect, matchPath} from 'react-router-dom';

import {makeAsyncComponent} from 'components/async_load';
import ChannelIdentifierRouter from 'components/channel_layout/channel_identifier_router';
import LoadingScreen from 'components/loading_screen';

// import {SCHEDULED_POST_URL_SUFFIX} from 'utils/constants';
import {IDENTIFIER_PATH_PATTERN, ID_PATH_PATTERN, TEAM_NAME_PATH_PATTERN} from 'utils/path';

import type {OwnProps, PropsFromRedux} from './index';

const MobileChannelHeader = makeAsyncComponent('MobileChannelHeader', lazy(() => import('components/mobile_channel_header')));
const GlobalThreads = makeAsyncComponent('GlobalThreads', lazy(() => import('components/threading/global_threads')),
    (
        <div className='app__content'>
            <LoadingScreen/>
        </div>
    ),
);
// const Drafts = makeAsyncComponent('Drafts', lazy(() => import('components/drafts')),
//     (
//         <div className='app__content'>
//             <LoadingScreen/>
//         </div>
//     ),
// );
const Recaps = makeAsyncComponent('Recaps', lazy(() => import('components/recaps')),
    (
        <div className='app__content'>
            <LoadingScreen/>
        </div>
    ),
);
const PermalinkView = makeAsyncComponent('PermalinkView', lazy(() => import('components/permalink_view')));
const PlaybookRunner = makeAsyncComponent('PlaybookRunner', lazy(() => import('components/channel_layout/playbook_runner')));
const MemberView = makeAsyncComponent('MemberView', lazy(() => import('components/narrow_views/member_view')));
const MentionView = makeAsyncComponent('MentionView', lazy(() => import('components/narrow_views/mention_view')));
const ChannelEntryRouter = makeAsyncComponent('ChannelEntryRouter', lazy(() => import('components/narrow_views/channel_entry_router')));

type Props = PropsFromRedux & OwnProps;

// The narrow shell's entry pages (the mention list and the conversation information page) are
// pages of their own: each carries its own header and its own way back. The channel header is
// drawn over the content for the message view, so on an entry page it would cover the page's own
// first rows and repeat a title the entry already shows. `/{team}/channels` is not one of them any
// more: without the bottom bar it redirects to the last conversation on every width (R1, R2).
const ENTRY_PATHS = [
    `/:team(${TEAM_NAME_PATH_PATTERN})/mentions`,
    `/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels)/:identifier(${IDENTIFIER_PATH_PATTERN})/members`,
    `/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels)/:identifier(${IDENTIFIER_PATH_PATTERN})/mentions`,
];

export function isEntryPage(pathname: string) {
    return ENTRY_PATHS.some((path) => matchPath(pathname, {path, exact: true}) !== null);
}

type State = {
    returnTo: string;
    lastReturnTo: string;
};

export default class CenterChannel extends React.PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            returnTo: '',
            lastReturnTo: '',
        };
    }

    static getDerivedStateFromProps(nextProps: Props, prevState: State) {
        if (prevState.lastReturnTo !== nextProps.location.pathname && nextProps.location.pathname.includes('/pl/')) {
            return {
                lastReturnTo: nextProps.location.pathname,
                returnTo: prevState.lastReturnTo,
            };
        }
        return {lastReturnTo: nextProps.location.pathname};
    }

    async componentDidMount() {
        const {actions} = this.props;
        await actions.getProfiles();
    }

    render() {
        const {lastChannelPath, isCollapsedThreadsEnabled, isMobileView} = this.props;
        const url = this.props.match.url;
        const showChannelHeader = isMobileView && !isEntryPage(this.props.location.pathname);

        return (
            <div
                key='inner-wrap'
                className={classNames('inner-wrap', 'channel__wrap', {
                    'move--right': this.props.lhsOpen,
                    'move--left': this.props.rhsOpen,
                    'move--left-small': this.props.rhsMenuOpen,
                })}
            >
                {showChannelHeader && <MobileChannelHeader/>}
                <div className='row main'>
                    <Switch>
                        {/*
                            The narrow shell has no conversation list of its own any more: the left
                            sidebar is the channel list on every width. A bookmark, a cold start or a
                            back navigation that lands on this address therefore opens the channel the
                            user last read, instead of a page that would only repeat the sidebar.
                        */}
                        <Route
                            exact={true}
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/channels`}
                            render={() => <Redirect to={lastChannelPath}/>}
                        />
                        {/*
                            The notification entry is a team-level address: it must open even when
                            no conversation has been visited yet, and it must survive a refresh or
                            a deep link. On a wide screen the mentions panel is the place for it,
                            so the address falls back to the conversation the user last read.
                        */}
                        <Route
                            exact={true}
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/mentions`}
                            render={() => (isMobileView ? <MentionView/> : <Redirect to={lastChannelPath}/>)}
                        />
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels)/:identifier(${IDENTIFIER_PATH_PATTERN})/members`}
                            render={(props) => (
                                <ChannelEntryRouter {...props}>
                                    <MemberView/>
                                </ChannelEntryRouter>
                            )}
                        />
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels)/:identifier(${IDENTIFIER_PATH_PATTERN})/mentions`}
                            render={(props) => (
                                <ChannelEntryRouter {...props}>
                                    <MentionView/>
                                </ChannelEntryRouter>
                            )}
                        />
                        <Route
                            path={`${url}/pl/:postid(${ID_PATH_PATTERN})`}
                            render={(props) => (
                                <PermalinkView
                                    {...props}
                                    returnTo={this.state.returnTo}
                                />
                            )}
                        />
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/:path(channels|messages)/:identifier(${IDENTIFIER_PATH_PATTERN})/:postid(${ID_PATH_PATTERN})?`}
                            component={ChannelIdentifierRouter}
                        />
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/_playbooks/:playbookId(${ID_PATH_PATTERN})/run`}
                        >
                            <PlaybookRunner/>
                        </Route>
                        {isCollapsedThreadsEnabled ? (
                            <Route
                                path={`/:team(${TEAM_NAME_PATH_PATTERN})/threads/:threadIdentifier(${ID_PATH_PATTERN})?`}
                                component={GlobalThreads}
                            />
                        ) : null}
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/recaps`}
                            component={Recaps}
                        />
                        {/* LZX: drafts route disabled
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/drafts`}
                            component={Drafts}
                        />
                        <Route
                            path={`/:team(${TEAM_NAME_PATH_PATTERN})/${SCHEDULED_POST_URL_SUFFIX}`}
                            component={Drafts}
                        />
                        */}

                        <Redirect to={lastChannelPath}/>
                    </Switch>
                </div>
            </div>
        );
    }
}
