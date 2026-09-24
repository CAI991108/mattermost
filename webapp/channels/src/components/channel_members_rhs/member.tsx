// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useEffect} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import {WithTooltip} from '@mattermost/shared/components/tooltip';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';
import {isGuest} from 'mattermost-redux/utils/user_utils';

import {getIsMobileView} from 'selectors/views/browser';

import ChannelMembersDropdown from 'components/channel_members_dropdown';
import CustomStatusEmoji from 'components/custom_status/custom_status_emoji';
import ProfilePicture from 'components/profile_picture';
import ProfilePopover from 'components/profile_popover';
import SharedChannelIndicator from 'components/shared_channel_indicator';
import GuestTag from 'components/widgets/tag/guest_tag';

import Constants from 'utils/constants';

import type {ChannelMember as ChannelMemberType} from './member_list';

interface Props {
    channel: Channel;
    member: ChannelMemberType;
    index: number;
    totalUsers: number;
    editing: boolean;
    actions: {
        openDirectMessage: (user: UserProfile) => void;
        fetchRemoteClusterInfo: (remoteId: string, includeDeleted?: boolean, forceRefresh?: boolean) => void;
    };
}

const Member = ({channel, member, index, totalUsers, editing, actions}: Props) => {
    const {formatMessage} = useIntl();
    const isMobileView = useSelector(getIsMobileView);

    // Fetch remote info when component mounts for remote users
    useEffect(() => {
        if (member.user.remote_id) {
            actions.fetchRemoteClusterInfo(member.user.remote_id, true);
        }
    }, [member.user.remote_id]);

    const userProfileSrc = Client4.getProfilePictureUrl(member.user.id, member.user.last_picture_update);

    // A touch screen has no hover and no room for two separate affordances, so tapping the row
    // opens the direct message while the avatar alone opens the profile popover. Direct
    // message channels already behaved that way; the narrow shell extends it to every channel.
    const rowOpensDirectMessage = !editing && (isMobileView || channel.type === Constants.DM_CHANNEL);
    const dmUnreadCount = member.dmUnreadCount || 0;

    const memberInfo = (
        <>
            <span className='channel-members-rhs__display-name'>
                {member.displayName}
                {isGuest(member.user.roles) && <GuestTag/>}
                {member.user.remote_id && (
                    <span className='channel-members-rhs__shared-icon'>
                        <SharedChannelIndicator
                            withTooltip={true}
                            remoteNames={member.remoteDisplayName ? [member.remoteDisplayName] : undefined}
                        />
                    </span>
                )}
            </span>
            {member.displayName === member.user.username ? null : <span className='channel-members-rhs__username'>{'@'}{member.user.username}</span>}
            <CustomStatusEmoji
                userID={member.user.id}
                showTooltip={true}
                emojiSize={16}
                spanStyle={{
                    display: 'flex',
                    flex: '0 0 auto',
                    alignItems: 'center',
                }}
                emojiStyle={{
                    marginLeft: '8px',
                    alignItems: 'center',
                }}
            />
        </>
    );

    return (
        <div
            className={classNames('channel-members-rhs__member', {
                'channel-members-rhs__member--touch': isMobileView,
            })}
            style={{height: '48px'}}
            data-testid={`memberline-${member.user.id}`}
        >
            <span className='ProfileSpan'>
                {rowOpensDirectMessage ? (
                    <>
                        <ProfilePopover
                            triggerComponentClass='channel-members-rhs__avatar-popover'
                            userId={member.user.id}
                            src={userProfileSrc}
                            hideStatus={member.user.is_bot}
                        >
                            <div className='channel-members-rhs__avatar'>
                                <ProfilePicture
                                    size='sm'
                                    status={member.status}
                                    isBot={member.user.is_bot}
                                    userId={member.user.id}
                                    username={member.displayName}
                                    src={userProfileSrc}
                                />
                            </div>
                        </ProfilePopover>
                        <button
                            type='button'
                            className='channel-members-rhs__member-info-button'
                            onClick={() => actions.openDirectMessage(member.user)}
                        >
                            {memberInfo}
                        </button>
                    </>
                ) : (
                    <>
                        <div className='channel-members-rhs__avatar'>
                            <ProfilePicture
                                size='sm'
                                status={member.status}
                                isBot={member.user.is_bot}
                                userId={member.user.id}
                                username={member.displayName}
                                src={userProfileSrc}
                            />
                        </div>
                        <ProfilePopover
                            triggerComponentClass='profileSpan_userInfo'
                            userId={member.user.id}
                            src={userProfileSrc}
                            hideStatus={member.user.is_bot}
                        >
                            {memberInfo}
                        </ProfilePopover>
                    </>
                )}
            </span>

            {dmUnreadCount > 0 && (
                <span className='channel-members-rhs__dm-unread-badge'>
                    {dmUnreadCount > 99 ? '99+' : dmUnreadCount}
                </span>
            )}

            <div
                className={classNames('channel-members-rhs__role-chooser', {editing})}
                data-testid='rolechooser'
            >
                {member.membership && (
                    <ChannelMembersDropdown
                        channel={channel}
                        user={member.user}
                        channelMember={member.membership}
                        index={index}
                        totalUsers={totalUsers}
                        channelAdminLabel={
                            <FormattedMessage
                                id='channel_members_rhs.member.select_role_channel_admin'
                                defaultMessage='Admin'
                            />
                        }
                        channelMemberLabel={
                            <FormattedMessage
                                id='channel_members_rhs.member.select_role_channel_member'
                                defaultMessage='Member'
                            />
                        }
                        guestLabel={
                            <FormattedMessage
                                id='channel_members_rhs.member.select_role_guest'
                                defaultMessage='Guest'
                            />
                        }
                    />
                )}
            </div>
            {!editing && (
                <WithTooltip
                    title={formatMessage({
                        id: 'channel_members_rhs.member.send_message',
                        defaultMessage: 'Send message',
                    })}
                >
                    <button
                        className='channel-members-rhs__send-message'
                        onClick={() => actions.openDirectMessage(member.user)}
                        aria-label={formatMessage({
                            id: 'channel_members_rhs.member.send_message',
                            defaultMessage: 'Send message',
                        })}
                    >
                        <i className='icon icon-send'/>
                    </button>
                </WithTooltip>
            )}
        </div>
    );
};

export default Member;
