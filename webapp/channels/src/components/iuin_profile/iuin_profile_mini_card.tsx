// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {getIuinProfileData, splitProfileList} from './profile_data';
import {useIuinJoinedTeamLabels} from './use_joined_channels';

import './iuin_profile.scss';

type Props = {
    user: UserProfile;
};

export default function IuinProfileMiniCard({user}: Props) {
    const currentUser = useSelector(getCurrentUser);
    const profile = getIuinProfileData(user);
    const fields = splitProfileList(profile.researchFields);
    const joinedTeams = useIuinJoinedTeamLabels(user.id, Boolean(currentUser?.id));
    const hasContent = Boolean(profile.statusMedia || profile.researchStatus || fields.length || joinedTeams.length);

    if (!hasContent) {
        return (
            <div className='iuin-profile-mini-card iuin-profile-mini-card--empty'>
                <div className='iuin-profile-mini-card__title'>
                    <FormattedMessage
                        id='iuin_profile.popover.title'
                        defaultMessage='Research profile'
                    />
                </div>
                <p>
                    <FormattedMessage
                        id='iuin_profile.popover.empty'
                        defaultMessage='No research profile yet.'
                    />
                </p>
            </div>
        );
    }

    return (
        <div className='iuin-profile-mini-card'>
            <div className='iuin-profile-mini-card__title'>
                <FormattedMessage
                    id='iuin_profile.popover.title'
                    defaultMessage='Research profile'
                />
            </div>
            {(profile.statusMedia || profile.researchStatus) && (
                <div className='iuin-profile-mini-card__section'>
                    <div className='iuin-profile-mini-card__subtitle'>
                        <FormattedMessage
                            id='iuin_profile.editor.status'
                            defaultMessage='Status'
                        />
                    </div>
                    {profile.statusMedia && (
                        <img
                            className='iuin-profile-mini-card__media'
                            src={profile.statusMedia}
                            alt=''
                        />
                    )}
                    {profile.researchStatus && (
                        <p className='iuin-profile-mini-card__status'>
                            {profile.researchStatus}
                        </p>
                    )}
                </div>
            )}
            <div className='iuin-profile-mini-card__section'>
                <div className='iuin-profile-mini-card__subtitle'>
                    <FormattedMessage
                        id='iuin_profile.editor.fields'
                        defaultMessage='Research fields'
                    />
                </div>
                {fields.length > 0 ? (
                    <div className='iuin-profile-mini-card__chips'>
                        {fields.map((field) => (
                            <span key={field}>
                                {field}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className='iuin-profile-mini-card__empty'>
                        <FormattedMessage
                            id='iuin_profile.fields_empty'
                            defaultMessage='No research fields yet.'
                        />
                    </p>
                )}
            </div>
            <div className='iuin-profile-mini-card__section'>
                <div className='iuin-profile-mini-card__subtitle'>
                    <FormattedMessage
                        id='iuin_profile.joined_teams'
                        defaultMessage='Joined teams'
                    />
                </div>
                {joinedTeams.length > 0 ? (
                    <div className='iuin-profile-mini-card__teams'>
                        {joinedTeams.map((team) => (
                            <span key={team}>
                                {team}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className='iuin-profile-mini-card__empty'>
                        <FormattedMessage
                            id='iuin_profile.teams_empty'
                            defaultMessage='No teams yet.'
                        />
                    </p>
                )}
            </div>
        </div>
    );
}
