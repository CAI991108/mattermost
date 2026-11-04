// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {Link} from 'react-router-dom';

import ChevronLeftIcon from '@mattermost/compass-icons/components/chevron-left';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getIsCrossTeamSearchEnabled} from 'mattermost-redux/selectors/entities/general';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import {closeRightHandSide, showChannelFiles, showPinnedPosts} from 'actions/views/rhs';
import {getIsRhsExpanded} from 'selectors/rhs';

import ChannelMembersRHS from 'components/channel_members_rhs';
import ChannelHeaderMenuItems from 'components/channel_header_menu/channel_header_menu_items';
import useSearchResultsActions from 'components/common/hooks/use_search_results_actions';
import {MenuContext} from 'components/menu/menu_context';
import SearchResults from 'components/search_results';

import {ActionTypes} from 'utils/constants';

import MemberSectionsSelector from './member_sections_selector';
import type {MemberSection} from './member_sections_selector';

import './narrow_views.scss';

/**
 * The settings section renders the channel menu's item list outside a menu. An item there acts
 * on the first click, so the list supplies the context a menu would otherwise supply: the
 * "menu closed" callback runs at once, which is what makes the item's action run (a menu that
 * is not there never closes, and an item that waits for that would never act).
 */
const ITEM_ACTING_CONTEXT = {
    isOpen: true,
    addOnClosedListener: (listener: () => void) => listener(),
    handleClosed: () => {},
};

/**
 * The view the "members" entry leads to. Its member list, pinned posts and files are the
 * entry's own first level content behind a second level selector, never a panel: the
 * right-hand panel is suppressed for as long as the entry is on screen, so the same list is
 * never rendered twice and nothing is laid over it (KTD6, KTD8, R7, R11).
 */
export default function MemberView() {
    const dispatch = useDispatch();
    const intl = useIntl();
    const [section, setSection] = useState<MemberSection>('members');

    const channel = useSelector(getCurrentChannel);
    const team = useSelector(getCurrentTeam);
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
        case 'settings':
            return (
                <div className='channel-settings-list'>
                    <MenuContext.Provider value={ITEM_ACTING_CONTEXT}>
                        <ChannelHeaderMenuItems
                            isMobile={true}

                            // Pinned posts are a section of their own on this page, so the
                            // menu's shortcut to them would open the same list twice (R9).
                            showPinnedPosts={false}
                        />
                    </MenuContext.Provider>
                </div>
            );
        default:
            return <ChannelMembersRHS/>;
        }
    };

    const backTo = channel && team ? `/${team.name}/channels/${channel.name}` : '/';

    return (
        <div
            className='entry-view member-view'
            data-testid='memberView'
        >
            <div className='entry-view__header entry-view__header--navigable'>
                <Link
                    to={backTo}
                    className='entry-view__back'
                    data-testid='memberViewBack'
                    aria-label={intl.formatMessage({
                        id: 'entry_view.back_to_conversation',
                        defaultMessage: 'Back to conversation',
                    })}
                >
                    <ChevronLeftIcon size={20}/>
                </Link>
                <span className='entry-view__title'>
                    {intl.formatMessage({
                        id: 'entry_view.conversation_info',
                        defaultMessage: 'Conversation info',
                    })}
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
