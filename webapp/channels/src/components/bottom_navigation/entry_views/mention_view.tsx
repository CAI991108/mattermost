// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getIsCrossTeamSearchEnabled} from 'mattermost-redux/selectors/entities/general';

import {closeRightHandSide, showMentions} from 'actions/views/rhs';
import {getIsRhsExpanded} from 'selectors/rhs';

import useSearchResultsActions from 'components/common/hooks/use_search_results_actions';
import SearchResults from 'components/search_results';

import {ActionTypes} from 'utils/constants';

import './entry_views.scss';

/**
 * The notification entry. It mounts the same mentions action the desktop entry uses, then
 * suppresses the right-hand panel so the mentions list is rendered here instead of in a
 * panel covering this view, and closes the panel when the entry is left (R2, R16).
 */
export default function MentionView() {
    const dispatch = useDispatch();
    const channelDisplayName = useSelector(getCurrentChannel)?.display_name ?? '';
    const isRhsExpanded = useSelector(getIsRhsExpanded);
    const crossTeamSearchEnabled = useSelector(getIsCrossTeamSearchEnabled);
    const searchActions = useSearchResultsActions();

    useEffect(() => {
        dispatch(showMentions());
        dispatch({type: ActionTypes.SUPPRESS_RHS});

        return () => {
            dispatch(closeRightHandSide());
            dispatch({type: ActionTypes.UNSUPPRESS_RHS});
        };
    }, [dispatch]);

    return (
        <div
            className='entry-view mention-view'
            data-testid='mentionView'
        >
            <div className='entry-view__header'>
                <span className='entry-view__title'>
                    <FormattedMessage
                        id='bottom_navigation.notifications'
                        defaultMessage='Notifications'
                    />
                </span>
            </div>
            <div className='entry-view__body'>
                <SearchResults
                    isMentionSearch={true}
                    isFlaggedPosts={false}
                    isPinnedPosts={false}
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
            </div>
        </div>
    );
}
