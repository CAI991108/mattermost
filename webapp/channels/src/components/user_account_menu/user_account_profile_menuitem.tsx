// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {HomeVariantOutlineIcon} from '@mattermost/compass-icons/components';
import type {UserProfile} from '@mattermost/types/users';

import {savePreferences} from 'mattermost-redux/actions/preferences';
import {getInt} from 'mattermost-redux/selectors/entities/preferences';

import * as Menu from 'components/menu';
import {OnboardingTaskCategory, OnboardingTasksName, TaskNameMapToSteps, CompleteYourProfileTour} from 'components/onboarding_tasks';

import {getHistory} from 'utils/browser_history';

import type {GlobalState} from 'types/store';

interface Props {
    userId: UserProfile['id'];
    username?: UserProfile['username'];
}

export default function UserAccountProfileMenuItem(props: Props) {
    const dispatch = useDispatch();

    const onboardingTaskStep = useSelector((state: GlobalState) => getInt(state, OnboardingTaskCategory, OnboardingTasksName.COMPLETE_YOUR_PROFILE, 0));
    const isCompleteYourProfileTaskPending = onboardingTaskStep === TaskNameMapToSteps[OnboardingTasksName.COMPLETE_YOUR_PROFILE].STARTED;

    function handleTourClick() {
        const taskName = OnboardingTasksName.COMPLETE_YOUR_PROFILE;
        const steps = TaskNameMapToSteps[taskName];

        dispatch(savePreferences(props.userId, [{
            user_id: props.userId,
            category: OnboardingTaskCategory,
            name: taskName,
            value: steps.FINISHED.toString(),
        }]));
    }

    function handleClick() {
        if (props.username) {
            getHistory().push(`/u/${props.username}`);
        }

        if (isCompleteYourProfileTaskPending) {
            handleTourClick();
        }
    }

    return (
        <Menu.Item
            leadingElement={
                <HomeVariantOutlineIcon
                    size={18}
                    aria-hidden='true'
                />
            }
            labels={
                <FormattedMessage
                    id='iuin_profile.account_menu.enter_homepage'
                    defaultMessage='Enter homepage'
                />
            }
            trailingElements={isCompleteYourProfileTaskPending && (
                <CompleteYourProfileTour/>
            )}
            aria-haspopup={true}
            onClick={handleClick}
        />
    );
}
