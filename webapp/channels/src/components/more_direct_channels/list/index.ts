// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import type {GlobalState} from 'types/store';

import List from './list';

import type {Option, OptionValue} from '../types';

type OwnProps = {
    users: UserProfile[];
    values: OptionValue[];
}

export function getOptions(users: UserProfile[]): Option[] {
    return users.
        filter((user) => user.delete_at === 0).
        map((user) => ({...user, last_post_at: 0})).
        sort((a, b) => a.username.localeCompare(b.username));
}

function makeMapStateToProps() {
    return (_state: GlobalState, ownProps: OwnProps) => {
        return {
            options: getOptions(ownProps.users),
        };
    };
}

export default connect(makeMapStateToProps)(List);
