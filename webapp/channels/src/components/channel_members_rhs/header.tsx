// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import styled from 'styled-components';

import type {Channel} from '@mattermost/types/channels';

interface Props {
    channel: Channel;
}

const HeaderTitle = styled.span`
    line-height: 2.4rem;
`;

const Header = ({channel}: Props) => {
    return (
        <div className='sidebar--right__header'>
            <span className='sidebar--right__title'>
                <h2>
                    <HeaderTitle
                        id='rhsPanelTitle'
                    >
                        <FormattedMessage
                            id='channel_members_rhs.header.title'
                            defaultMessage='Members'
                        />
                    </HeaderTitle>

                    {channel.display_name &&
                    <span
                        className='style--none sidebar--right__title__subtitle'
                    >
                        {channel.display_name}
                    </span>
                    }
                </h2>
            </span>
        </div>
    );
};

export default Header;
