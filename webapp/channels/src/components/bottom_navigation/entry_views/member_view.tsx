// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getIsCrossTeamSearchEnabled} from 'mattermost-redux/selectors/entities/general';

import {closeRightHandSide, showChannelFiles, showPinnedPosts} from 'actions/views/rhs';
import {getIsRhsExpanded} from 'selectors/rhs';

import ChannelMembersRHS from 'components/channel_members_rhs';
import useSearchResultsActions from 'components/common/hooks/use_search_results_actions';
import SearchResults from 'components/search_results';

import {ActionTypes} from 'utils/constants';

import MemberSectionsSelector, {MEMBER_SECTION_LABELS} from './member_sections_selector';
import type {MemberSection} from './member_sections_selector';

import './entry_views.scss';

/**
 * The view the "members" entry leads to. Its member list, pinned posts and files are the
 * entry's own first level content behind a second level selector, never a panel: the
 * right-hand panel is suppressed for as long as the entry is on screen, so the same list is
 * never rendered twice and nothing is laid over it (KTD6, KTD8, R7, R11).
 */
export default function MemberView() {
    const dispatch = useDispatch();
    const [section, setSection] = useState<MemberSection>('members');

    const channel = useSelector(getCurrentChannel);
    const channelId = channel?.id;
    const channelDisplayName = channel?.display_name ?? '';
    const isRhsExpanded = useSelector(getIsRhsExpanded);
    const crossTeamSearchEnabled = useSelector(getIsCrossTeamSearchEnabled);
    const searchActions = useSearchResultsActions();

    useEffect(() => {
        dispatch({type: ActionTypes.SUPPRESS_RHS});

        return () => {
            dispatch(closeRightHandSide());
            dispatch({type: ActionTypes.UNSUPPRESS_RHS});
        };
    }, [dispatch]);

    // The pinned posts and the files render from the same search state the panel's tab bar
    // fills, so they are loaded with the same actions. The panel stays suppressed meanwhile,
    // which is what keeps the section state out of the panel's own state (KTD8).
    useEffect(() => {
        if (!channelId) {
            return;
        }

        if (section === 'pinned') {
            dispatch(showPinnedPosts(channelId));
        } else if (section === 'files') {
            dispatch(showChannelFiles(channelId));
        }
    }, [channelId, dispatch, section]);

    const renderSection = () => {
        switch (section) {
        case 'pinned':
            return (
                <SearchResults
                    isMentionSearch={false}
                    isFlaggedPosts={false}
                    isPinnedPosts={true}
                    isChannelFiles={false}
                    isSideBarExpanded={isRhsExpanded}
                    isOpened={true}
                    channelDisplayName={channelDisplayName}
                    updateSearchTerms={searchActions.updateSearchTerms}
                    updateSearchTeam={searchActions.updateSearchTeam}
                    getMorePostsForSearch={searchActions.getMorePostsForSearch}
                    getMoreFilesForSearch={searchActions.getMoreFilesForSearch}
                    setSearchFilterType={searchActions.setSearchFilterType}
                    searchFilterType={searchActions.searchFilterType}
                    searchType={'messages'}
                    crossTeamSearchEnabled={crossTeamSearchEnabled}
                />
            );
        case 'files':
            return (
                <SearchResults
                    isMentionSearch={false}
                    isFlaggedPosts={false}
                    isPinnedPosts={false}
                    isChannelFiles={true}
                    isSideBarExpanded={isRhsExpanded}
                    isOpened={true}
                    channelDisplayName={channelDisplayName}
                    updateSearchTerms={searchActions.updateSearchTerms}
                    updateSearchTeam={searchActions.updateSearchTeam}
                    getMorePostsForSearch={searchActions.getMorePostsForSearch}
                    getMoreFilesForSearch={searchActions.getMoreFilesForSearch}
                    setSearchFilterType={searchActions.setSearchFilterType}
                    searchFilterType={searchActions.searchFilterType}
                    searchType={'files'}
                    crossTeamSearchEnabled={crossTeamSearchEnabled}
                />
            );
        default:
            return <ChannelMembersRHS/>;
        }
    };

    return (
        <div
            className='entry-view member-view'
            data-testid='memberView'
        >
            <div className='entry-view__header'>
                <span className='entry-view__title'>
                    {MEMBER_SECTION_LABELS[section]}
                </span>
            </div>
            <MemberSectionsSelector
                selected={section}
                onChange={setSection}
            />
            <div
                className='entry-view__body'
                id={`member-sections-panel-${section}`}
                role='tabpanel'
                aria-labelledby={`member-sections-tab-${section}`}
                data-testid='memberViewBody'
            >
                {renderSection()}
            </div>
        </div>
    );
}
