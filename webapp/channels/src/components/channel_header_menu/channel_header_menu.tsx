// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import type {ReactNode} from 'react';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {Link} from 'react-router-dom';

import ChevronDownIcon from '@mattermost/compass-icons/components/chevron-down';
import type {UserProfile} from '@mattermost/types/users';

import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';

import * as Menu from 'components/menu';

import {Constants} from 'utils/constants';

import ChannelHeaderMenuItems from './channel_header_menu_items';

import ChannelHeaderTitleDirect from '../channel_header/channel_header_title_direct';
import ChannelHeaderTitleGroup from '../channel_header/channel_header_title_group';

type Props = {
    dmUser?: UserProfile;
    gmMembers?: UserProfile[];
    archivedIcon?: JSX.Element;
    sharedIcon?: JSX.Element;
    isMobile?: boolean;
}

export default function ChannelHeaderMenu({dmUser, gmMembers, isMobile, archivedIcon, sharedIcon}: Props): JSX.Element | null {
    const intl = useIntl();

    const channel = useSelector(getCurrentChannel);
    const team = useSelector(getCurrentTeam);

    if (!channel) {
        return null;
    }

    const isDirect = (channel.type === Constants.DM_CHANNEL);
    const isGroup = (channel.type === Constants.GM_CHANNEL);

    let channelTitle: ReactNode = channel.display_name;
    if (isDirect && dmUser) {
        channelTitle = <ChannelHeaderTitleDirect dmUser={dmUser}/>;
    } else if (isGroup) {
        channelTitle = <ChannelHeaderTitleGroup gmMembers={gmMembers}/>;
    }

    const ariaLabel = intl.formatMessage({
        id: 'channel_header.otherchannel',
        defaultMessage: '{displayName} Channel Menu',
    }, {
        displayName: channel.display_name,
    });

    // On a narrow screen the title is the way into the conversation's information page. The menu
    // the title used to carry is not next to it any more: the page's settings section carries the
    // same operations, so a second entry to them would be a duplicate (R9, R10). Direct and group
    // messages keep the title trigger, because their information page is the channel info panel.
    const isChannelConversation = !isDirect && !isGroup;

    if (isMobile && isChannelConversation && team) {
        return (
            <Link
                to={`/${team.name}/channels/${channel.name}/members`}
                className='channel-header__trigger channel-header__title-link style--none'
                data-testid='channelHeaderTitleLink'
                aria-label={ariaLabel.toLowerCase()}
            >
                {archivedIcon}
                <strong
                    id='channelHeaderTitle'
                    className='heading'
                >
                    {channelTitle as string}
                </strong>
                {sharedIcon}
            </Link>
        );
    }

    return (
        <Menu.Container
            menuButtonTooltip={{
                text: channelTitle as string,
            }}
            menuButton={{
                id: 'channelHeaderDropdownButton',
                class: classNames('channel-header__trigger style--none'),
                children: (
                    <>
                        {archivedIcon}
                        <strong
                            id='channelHeaderTitle'
                            className='heading'
                        >
                            {channelTitle as string}
                        </strong>
                        {sharedIcon}
                        <ChevronDownIcon size={16}/>
                    </>
                ),
                'aria-label': ariaLabel.toLowerCase(),
            }}
            menu={{
                id: 'channelHeaderDropdownMenu',
            }}
            transformOrigin={{
                horizontal: 'left',
                vertical: 'top',
            }}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
            }}
        >
            <ChannelHeaderMenuItems isMobile={isMobile}/>
        </Menu.Container>
    );
}
