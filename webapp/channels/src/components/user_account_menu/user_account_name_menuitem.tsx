// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useSelector} from 'react-redux';

import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import * as Menu from 'components/menu';
import Avatar from 'components/widgets/users/avatar/avatar';

import {getHistory} from 'utils/browser_history';

interface Props extends Menu.FirstMenuItemProps {
    profilePicture?: string;
}

export default function UserAccountNameMenuItem({profilePicture, ...rest}: Props) {
    const currentUser = useSelector(getCurrentUser);

    function handleClick() {
        if (currentUser?.username) {
            getHistory().push(`/u/${currentUser.username}`);
        }
    }

    function getLabel() {
        if (
            currentUser?.first_name?.length > 0 ||
            currentUser?.last_name?.length > 0
        ) {
            const name = `${currentUser?.first_name} ${currentUser?.last_name}`?.trim();

            return (
                <>
                    <span className='userAccountMenu_nameMenuItem_primaryLabel'>
                        {name}
                    </span>
                    <span className='userAccountMenu_nameMenuItem_secondaryLabel'>
                        {'@' + currentUser?.username}
                    </span>
                </>
            );
        }

        const username = `@${currentUser?.username}`?.trim();

        return (
            <h2 className='userAccountMenu_nameMenuItem_primaryLabel'>
                {username}
            </h2>
        );
    }

    return (
        <Menu.Item
            className='userAccountMenu_nameMenuItem'
            leadingElement={
                <Avatar
                    size='lg'
                    url={profilePicture}
                    aria-hidden='true'
                />
            }
            labels={getLabel()}
            onClick={handleClick}
            aria-haspopup={true}
            {...rest}
        />
    );
}
