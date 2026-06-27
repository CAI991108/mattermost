// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import {HomeVariantOutlineIcon, SendIcon} from '@mattermost/compass-icons/components';
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
    const enterHomepageLabel = formatMessage({
        id: 'iuin_profile.account.enterHomepage',
        defaultMessage: 'Enter homepage',
    });
    const sendYourselfMessageLabel = formatMessage({
        id: 'user_profile.send.dm.yourself',
        defaultMessage: 'Send yourself a message',
    });

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
            <WithTooltip title={enterHomepageLabel}>
                <button
                    type='button'
                    className='btn btn-icon btn-sm'
                    onClick={handleViewHomepage}
                    aria-label={enterHomepageLabel}
                >
                    <HomeVariantOutlineIcon
                        size={18}
                        aria-hidden='true'
                    />
                </button>
            </WithTooltip>
            <WithTooltip
                title={sendYourselfMessageLabel}
            >
                <button
                    type='button'
                    className='btn btn-icon btn-sm'
                    onClick={handleShowDirectChannel}
                    aria-label={sendYourselfMessageLabel}
                >
                    <SendIcon
                        size={18}
                        aria-hidden='true'
                    />
                </button>
            </WithTooltip>
        </div>
    );
};

export default ProfilePopoverSelfUserRow;
