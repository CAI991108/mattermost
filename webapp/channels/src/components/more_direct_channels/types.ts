// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import type {Value} from 'components/multiselect/multiselect';

export type Option = UserProfile & {last_post_at?: number};

export type OptionValue = Option & Value;

export function optionValue(option: Option): OptionValue {
    return {
        value: option.id,
        label: option.username,
        ...option,
    };
}
