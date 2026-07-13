// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';
import type {Dispatch} from 'redux';

import type {UserProfile} from '@mattermost/types/users';

import {
    searchProfiles,
    canUserDirectMessage,
} from 'mattermost-redux/actions/users';
import {getConfig, getFeatureFlagValue} from 'mattermost-redux/selectors/entities/general';
import {
    getCurrentUserId,
    getProfilesInCurrentChannel,
    makeSearchProfilesStartingWithTerm,
} from 'mattermost-redux/selectors/entities/users';

import {openDirectChannelToUserId} from 'actions/channel_actions';
import {loadStatusesForProfilesList, loadProfilesMissingStatus} from 'actions/status_actions';
import {setModalSearchTerm} from 'actions/views/search';

import type {GlobalState} from 'types/store';

import MoreDirectChannels from './more_direct_channels';

type OwnProps = {
    isExistingChannel: boolean;
}

export const makeMapStateToProps = () => {
    const searchProfilesStartingWithTerm = makeSearchProfilesStartingWithTerm();

    return (state: GlobalState, ownProps: OwnProps) => {
        const currentUserId = getCurrentUserId(state);
        let currentChannelMembers;
        if (ownProps.isExistingChannel) {
            currentChannelMembers = getProfilesInCurrentChannel(state);
        }

        const config = getConfig(state);
        const restrictDirectMessage = config.RestrictDirectMessage;

        const searchTerm = state.views.search.modalSearch;

        let filters;
        const enableSharedChannelsDMs = getFeatureFlagValue(state, 'EnableSharedChannelsDMs') === 'true';
        if (!enableSharedChannelsDMs) {
            filters = {exclude_remote: true};
        }

        let users: UserProfile[];
        // LZX: 无搜索词时不展示默认成员列表；输入搜索词后继续走全局用户搜索。
        if (searchTerm) {
            users = searchProfilesStartingWithTerm(state, searchTerm, false, filters);
        } else {
            users = [];
        }

        return {
            searchTerm,
            users,
            currentChannelMembers,
            currentUserId,
            restrictDirectMessage,
        };
    };
};

function mapDispatchToProps(dispatch: Dispatch) {
    return {
        actions: bindActionCreators({
            loadProfilesMissingStatus,
            loadStatusesForProfilesList,
            openDirectChannelToUserId,
            searchProfiles,
            setModalSearchTerm,
            canUserDirectMessage,
        }, dispatch),
    };
}

export default connect(makeMapStateToProps, mapDispatchToProps)(MoreDirectChannels);
