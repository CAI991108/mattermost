// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';

import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import type {GlobalState} from 'types/store';

import NarrowProfileRow from './narrow_profile_row';

const mapStateToProps = (state: GlobalState) => ({
    username: getCurrentUser(state)?.username ?? '',
});

export default connect(mapStateToProps)(NarrowProfileRow);
