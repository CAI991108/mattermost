// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {Link} from 'react-router-dom';

import ChevronLeftIcon from '@mattermost/compass-icons/components/chevron-left';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getIsCrossTeamSearchEnabled} from 'mattermost-redux/selectors/entities/general';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import {closeRightHandSide, showMentions} from 'actions/views/rhs';
import {getIsRhsExpanded} from 'selectors/rhs';

import useSearchResultsActions from 'components/common/hooks/use_search_results_actions';
import SearchResults from 'components/search_results';

import {ActionTypes} from 'utils/constants';

import './narrow_views.scss';

/**
 * The notification entry. It mounts the same mentions action the desktop entry uses, then
 * suppresses the right-hand panel so the mentions list is rendered here instead of in a
 * panel covering this view, and closes the panel when the entry is left.
 *
 * The page is no longer a bottom bar destination, so it carries its own way back: the channel
 * header belongs to the message view and is not drawn over an entry page (R5).
 */
export default function MentionView() {
    const dispatch = useDispatch();
    const intl = useIntl();
    const team = useSelector(getCurrentTeam);
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

    // `/{team}/channels` opens the conversation the user last read on every width, so the back
    // arrow returns to the conversation this page was entered from without carrying a return
    // address (R5).
    const backTo = team ? `/${team.name}/channels` : '/';

    return (
        <div
            className='entry-view mention-view'
            data-testid='mentionView'
        >
            <div className='entry-view__header entry-view__header--navigable'>
                <Link
                    to={backTo}
                    className='entry-view__back'
                    data-testid='mentionViewBack'
                    aria-label={intl.formatMessage({
                        id: 'narrow_views.back_to_conversation',
                        defaultMessage: 'Back to conversation',
                    })}
                >
                    <ChevronLeftIcon size={20}/>
                </Link>
                <span className='entry-view__title'>
                    <FormattedMessage
                        id='narrow_views.notifications'
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
