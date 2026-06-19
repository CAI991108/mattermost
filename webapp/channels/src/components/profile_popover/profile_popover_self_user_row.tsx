// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import {Button} from '@mattermost/shared/components/button';
import {WithTooltip} from '@mattermost/shared/components/tooltip';

import {getHistory} from 'utils/browser_history';

type Props = {
    userId: string;
    currentUserId: string;
    username: string;
    haveOverrideProp: boolean;
    hide?: () => void;
    returnFocus: () => void;
    handleCloseModals: () => void;
    handleShowDirectChannel: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ProfilePopoverSelfUserRow = ({
    userId,
    currentUserId,
    username,
    haveOverrideProp,
    hide,
    returnFocus,
    handleCloseModals,
    handleShowDirectChannel,
}: Props) => {
    const {formatMessage} = useIntl();

    const handleViewHomepage = useCallback(() => {
        hide?.();
        handleCloseModals();
        getHistory().push(`/u/${username}`);
        returnFocus();
    }, [hide, returnFocus, handleCloseModals, username]);

    if (userId !== currentUserId || haveOverrideProp) {
        return null;
    }

    return (
        <div
            className='user-popover__bottom-row-container'
        >
            <Button
                type='button'
                emphasis='primary'
                size='sm'
                onClick={handleViewHomepage}
            >
                <i
                    className='icon icon-home-outline'
                    aria-hidden='true'
                />
                <FormattedMessage
                    id='iuin_profile.account.enterHomepage'
                    defaultMessage='Enter homepage'
                />
            </Button>
            <WithTooltip
                title={formatMessage({id: 'user_profile.send.dm.yourself', defaultMessage: 'Send yourself a message'})}
            >
                <button
                    type='button'
                    className='btn btn-icon btn-sm'
                    onClick={handleShowDirectChannel}
                    aria-label={formatMessage({id: 'user_profile.send.dm.yourself', defaultMessage: 'Send yourself a message'})}
                >
                    <i
                        className='icon icon-send'
                        aria-hidden='true'
                    />
                </button>
            </WithTooltip>
        </div>
    );
};

export default ProfilePopoverSelfUserRow;
