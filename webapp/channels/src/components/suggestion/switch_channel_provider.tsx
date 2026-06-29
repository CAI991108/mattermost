// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useLayoutEffect, useRef, useState} from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {connect, useSelector} from 'react-redux';

import {WithTooltip} from '@mattermost/shared/components/tooltip';
import type {Channel, ChannelMembership} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';
import type {RelationOneToOne} from '@mattermost/types/utilities';

import {searchAllChannels} from 'mattermost-redux/actions/channels';
import {logError} from 'mattermost-redux/actions/errors';
import {
    getMyChannelMemberships,
    getDirectTeammate,
    getChannelsInAllTeams,
    getAllTeamsUnreadChannelIds,
} from 'mattermost-redux/selectors/entities/channels';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {
    getActiveTeamsList,
    getCurrentTeamId,
    getMyTeams,
    getTeam,
} from 'mattermost-redux/selectors/entities/teams';

import {
    getCurrentUserId,
    getUser,
    getStatusForUserId,
} from 'mattermost-redux/selectors/entities/users';
import type {ActionResult} from 'mattermost-redux/types/actions';
import {sortChannelsByTypeAndDisplayName, isChannelMuted} from 'mattermost-redux/utils/channel_utils';

import {isGuest} from 'mattermost-redux/utils/user_utils';

import {getPostDraft} from 'selectors/rhs';
import globalStore from 'stores/redux_store';

import usePrefixedIds, {joinIds} from 'components/common/hooks/usePrefixedIds';
import CustomStatusEmoji from 'components/custom_status/custom_status_emoji';
import ProfilePicture from 'components/profile_picture';
import SharedChannelIndicator from 'components/shared_channel_indicator';
import BotTag from 'components/widgets/tag/bot_tag';
import GuestTag from 'components/widgets/tag/guest_tag';

import {getArchiveIconClassName} from 'utils/channel_utils';
import {Constants, StoragePrefixes} from 'utils/constants';

import * as Utils from 'utils/utils';

import type {GlobalState} from 'types/store';

import Provider from './provider';
import type {ResultsCallback} from './provider';
import {SuggestionContainer} from './suggestion';
import type {SuggestionProps} from './suggestion';
import type {ProviderResults} from './suggestion_results';


type FakeChannel = Pick<Channel, 'id' | 'name' | 'display_name' | 'update_at' | 'delete_at'> & {
    type: string;
}

type FakeDirectChannel = FakeChannel & {
    userId: string;
}

type ChannelItem = Channel | FakeChannel | FakeDirectChannel;

function isRealChannel(item?: ChannelItem): item is Channel {
    return Boolean(item) && !isFakeChannel(item) && !isFakeDirectChannel(item);
}

function isFakeChannel(item?: ChannelItem): item is FakeChannel {
    return Boolean(item) && !('create_at' in item!);
}

function isFakeDirectChannel(item?: ChannelItem): item is FakeDirectChannel {
    return Boolean(item && 'userId' in item);
}

export interface WrappedChannel {
    channel: ChannelItem;
    name: string;
    deactivated: boolean;
    last_viewed_at?: number;
    type?: string;
    unread?: boolean;
    unread_mentions?: number;
}

type Props = SuggestionProps<WrappedChannel> & {
    id: string;
    channelMember: ChannelMembership;
    collapsedThreads: boolean;
    dmChannelTeammate?: UserProfile;
    hasDraft: boolean;
    isPartOfOnlyOneTeam: boolean;
    status?: string;
    team?: Team;
}

export const SwitchChannelSuggestion = React.forwardRef<HTMLLIElement, Props>(({
    id,
    item,
    channelMember: member,
    collapsedThreads,
    dmChannelTeammate: teammate,
    hasDraft,
    isPartOfOnlyOneTeam,
    status,
    team,
    ...otherProps
}, ref) => {
    const {formatMessage} = useIntl();

    const channel = item.channel;
    const channelIsArchived = channel.delete_at && channel.delete_at !== 0;

    const currentUserId = useSelector(getCurrentUserId);

    const channelNameRef = useRef<HTMLSpanElement>(null);
    const [isChannelNameTruncated, setIsChannelNameTruncated] = useState(false);
    const teamNameRef = useRef<HTMLSpanElement>(null);
    const [isTeamNameTruncated, setIsTeamNameTruncated] = useState(false);

    const ids = usePrefixedIds(id, {
        name: null,
        channelType: null,
        description: null,
        sharedIcon: null,
        tag: null,
        teamName: null,
        unreadBadge: null,
    });

    let badge = null;
    if ((member && member.notify_props) || item.unread_mentions) {
        let unreadMentions;
        if (item.unread_mentions) {
            unreadMentions = item.unread_mentions;
        } else {
            unreadMentions = collapsedThreads ? member.mention_count_root : member.mention_count;
        }
        if (unreadMentions > 0 && !channelIsArchived) {
            badge = (
                <div
                    id={ids.unreadBadge}
                    className={classNames('suggestion-list_unread-mentions', (isPartOfOnlyOneTeam ? 'position-end' : ''))}
                    aria-label={formatMessage({
                        id: 'channel_switch_modal.unreadMentions',
                        defaultMessage: '{count, number} {count, plural, one {unread notification} other {unread notifications}}',
                    }, {
                        count: unreadMentions,
                    })}
                >
                    <span className='badge'>
                        {unreadMentions}
                    </span>
                </div>
            );
        }
    }

    let name = channel.display_name;
    let description = '~' + channel.name;
    let icon;
    if (channelIsArchived) {
        icon = (
            <span
                id={ids.channelType}
                className='suggestion-list__icon suggestion-list__icon--large'
                aria-label={formatMessage({
                    id: 'suggestion.archived_channel',
                    defaultMessage: 'Archived channel',
                })}
            >
                <i className={`icon ${getArchiveIconClassName(channel.type)}`}/>
            </span>
        );
    } else if (hasDraft) {
        icon = (
            <span
                id={ids.channelType}
                className='suggestion-list__icon suggestion-list__icon--large'
                aria-label={formatMessage({
                    id: 'channel_switch_modal.has_draft',
                    defaultMessage: 'Has draft',
                })}
            >
                <i className='icon icon-pencil-outline'/>
            </span>
        );
    } else if (channel.type === Constants.OPEN_CHANNEL) {
        icon = (
            <span
                id={ids.channelType}
                className='suggestion-list__icon suggestion-list__icon--large'
                aria-label={formatMessage({
                    id: 'suggestion.public_channel',
                    defaultMessage: 'Public channel',
                })}
            >
                <i className='icon icon-globe'/>
            </span>
        );
    } else if (channel.type === Constants.PRIVATE_CHANNEL) {
        icon = (
            <span
                id={ids.channelType}
                className='suggestion-list__icon suggestion-list__icon--large'
                aria-label={formatMessage({
                    id: 'suggestion.private_channel',
                    defaultMessage: 'Private channel',
                })}
            >
                <i className='icon icon-lock-outline'/>
            </span>
        );
    } else if (channel.type === Constants.THREADS) {
        icon = (
            <span className='suggestion-list__icon suggestion-list__icon--large'>
                <i className='icon icon-message-text-outline'/>
            </span>
        );
    } else if (channel.type === Constants.GM_CHANNEL) {
        icon = (
            <span
                id={ids.channelType}
                aria-label={formatMessage({
                    id: 'suggestion.group_channel',
                    defaultMessage: 'Group channel',
                })}
                className='suggestion-list__icon suggestion-list__icon--large'
            >
                <div className='status status--group'>{'G'}</div>
            </span>
        );
    } else if (teammate) {
        icon = (
            <ProfilePicture
                src={Utils.imageURLForUser(teammate.id, teammate.last_picture_update)}
                status={teammate.is_bot ? undefined : status}
                size='sm'
            />
        );
    }

    let tag = null;
    let customStatus = null;
    if (channel.type === Constants.DM_CHANNEL && teammate) {
        if (teammate && teammate.is_bot) {
            tag = <BotTag/>;
        } else if (isGuest(teammate ? teammate.roles : '')) {
            tag = <GuestTag/>;
        }

        customStatus = (
            <CustomStatusEmoji
                showTooltip={true}
                userID={teammate.id}
                emojiStyle={{
                    marginBottom: 2,
                }}
            />
        );

        let deactivated = '';
        if (teammate.delete_at) {
            deactivated = (' - ' + formatMessage({id: 'channel_switch_modal.deactivated', defaultMessage: 'Deactivated'}));
        }

        if (channel.display_name && !(teammate && teammate.is_bot)) {
            description = '@' + teammate.username + deactivated;
        } else {
            name = teammate.username;
            if (teammate.id === currentUserId) {
                name += (' ' + formatMessage({id: 'suggestion.user.isCurrent', defaultMessage: '(you)'}));
            }
            description = deactivated;
        }
    } else if (channel.type === Constants.GM_CHANNEL) {
        // remove the slug from the option
        name = channel.display_name;
        description = '';
    }

    let sharedIcon = null;
    if (isRealChannel(channel) && channel.shared) {
        sharedIcon = (
            <span id={ids.sharedIcon}>
                <SharedChannelIndicator
                    className='shared-channel-icon'
                />
            </span>
        );
    }

    let teamName = null;
    if (isRealChannel(channel) && channel.team_id && team) {
        teamName = (
            <WithTooltip
                title={team.display_name}
                disabled={!isTeamNameTruncated}
            >
                <span
                    id={ids.teamName}
                    ref={teamNameRef}
                    className='ml-2 suggestion-list__team-name'
                >
                    {team.display_name}
                </span>
            </WithTooltip>
        );
    }
    const showSlug = (isPartOfOnlyOneTeam || channel.type === Constants.DM_CHANNEL) && channel.type !== Constants.THREADS;

    Reflect.deleteProperty(otherProps, 'dispatch');

    useLayoutEffect(() => {
        const channelEl = channelNameRef.current;
        setIsChannelNameTruncated(Boolean(channelEl && channelEl.scrollWidth > channelEl.clientWidth));

        const teamEl = teamNameRef.current;
        setIsTeamNameTruncated(Boolean(teamEl && teamEl.scrollWidth > teamEl.clientWidth));
    }, [name, description, showSlug, isPartOfOnlyOneTeam, team?.display_name, item.unread, channelIsArchived]);

    return (
        <SuggestionContainer
            ref={ref}
            id={id}
            data-testid={channel.name}
            item={item}
            {...otherProps}
            aria-labelledby={ids.name}
            aria-describedby={joinIds(ids.unreadBadge, ids.description, ids.teamName, ids.channelType, ids.sharedIcon, ids.tag)}
        >
            {icon}
            <div className='suggestion-list__ellipsis suggestion-list__flex'>
                <div className='suggestion-list__switch-channel-primary'>
                    <span className='suggestion-list__main'>
                        <WithTooltip
                            title={name}
                            disabled={!isChannelNameTruncated}
                        >
                            <span
                                id={ids.name}
                                ref={channelNameRef}
                                className={classNames('suggestion-list__channel-name-text', {'suggestion-list__unread': item.unread && !channelIsArchived})}
                            >
                                {name}
                            </span>
                        </WithTooltip>
                        {showSlug && description && (
                            <span
                                id={ids.description}
                                className='ml-2 suggestion-list__desc'
                            >
                                {description}
                            </span>
                        )}
                    </span>
                    {customStatus}
                    {sharedIcon}
                    {tag && <span id={ids.tag}>{tag}</span>}
                    {badge}
                </div>
                {!isPartOfOnlyOneTeam && teamName}
            </div>
        </SuggestionContainer>
    );
});
SwitchChannelSuggestion.displayName = 'SwitchChannelSuggestion';

type OwnProps = SuggestionProps<WrappedChannel>;

function mapStateToPropsForSwitchChannelSuggestion(state: GlobalState, ownProps: OwnProps) {
    const channel = ownProps.item && ownProps.item.channel;
    const channelId = channel ? channel.id : '';
    const draft = channelId ? getPostDraft(state, StoragePrefixes.DRAFT, channelId) : false;

    let dmChannelTeammate;
    if (isRealChannel(channel) && channel.type === Constants.DM_CHANNEL) {
        dmChannelTeammate = getDirectTeammate(state, channel.id);
    } else if (isFakeDirectChannel(channel)) {
        dmChannelTeammate = getUser(state, channel.userId);
    }

    let status;
    if (dmChannelTeammate) {
        status = getStatusForUserId(state, dmChannelTeammate.id);
    }

    const collapsedThreads = isCollapsedThreadsEnabled(state);

    let team;
    if (isRealChannel(channel)) {
        team = getTeam(state, channel.team_id);
    }

    const isPartOfOnlyOneTeam = getMyTeams(state).length === 1;

    return {
        channelMember: getMyChannelMemberships(state)[channelId],
        hasDraft: draft && Boolean(draft.message.trim() || draft.fileInfos.length || draft.uploadsInProgress.length),
        dmChannelTeammate,
        status,
        collapsedThreads,
        team,
        isPartOfOnlyOneTeam,
    };
}

export const ConnectedSwitchChannelSuggestion = connect(mapStateToPropsForSwitchChannelSuggestion, null, null, {forwardRef: true})(SwitchChannelSuggestion);

let prefix = '';

function sortChannelsByRecencyAndTypeAndDisplayName(wrappedA: WrappedChannel, wrappedB: WrappedChannel) {
    if (wrappedA.last_viewed_at && wrappedB.last_viewed_at) {
        return wrappedB.last_viewed_at - wrappedA.last_viewed_at;
    } else if (wrappedA.last_viewed_at) {
        return -1;
    } else if (wrappedB.last_viewed_at) {
        return 1;
    }

    // MM-12677 When this is migrated this needs to be fixed to pull the user's locale
    return sortChannelsByTypeAndDisplayName('en', wrappedA.channel as Channel, wrappedB.channel as Channel);
}

export function quickSwitchSorter(wrappedA: WrappedChannel, wrappedB: WrappedChannel) {
    const aIsArchived = wrappedA.channel.delete_at ? wrappedA.channel.delete_at !== 0 : false;
    const bIsArchived = wrappedB.channel.delete_at ? wrappedB.channel.delete_at !== 0 : false;

    if (aIsArchived && !bIsArchived) {
        return 1;
    } else if (!aIsArchived && bIsArchived) {
        return -1;
    }

    if (wrappedA.deactivated && !wrappedB.deactivated) {
        return 1;
    } else if (wrappedB.deactivated && !wrappedA.deactivated) {
        return -1;
    }

    const a = wrappedA.channel;
    const b = wrappedB.channel;

    let aDisplayName = a.display_name.toLowerCase();
    let bDisplayName = b.display_name.toLowerCase();

    if (a.type === Constants.DM_CHANNEL && aDisplayName.startsWith('@')) {
        aDisplayName = aDisplayName.substring(1);
    }

    if (b.type === Constants.DM_CHANNEL && bDisplayName.startsWith('@')) {
        bDisplayName = bDisplayName.substring(1);
    }

    const aStartsWith = aDisplayName.startsWith(prefix) || wrappedA.name.toLowerCase().startsWith(prefix);
    const bStartsWith = bDisplayName.startsWith(prefix) || wrappedB.name.toLowerCase().startsWith(prefix);

    // Open channels user haven't interacted should be at the  bottom of the list
    if (a.type === Constants.OPEN_CHANNEL && !wrappedA.last_viewed_at && (b.type !== Constants.OPEN_CHANNEL || wrappedB.last_viewed_at)) {
        return 1;
    } else if (b.type === Constants.OPEN_CHANNEL && !wrappedB.last_viewed_at) {
        return -1;
    }

    // Sort channels starting with the search term first
    if (aStartsWith && !bStartsWith) {
        return -1;
    } else if (!aStartsWith && bStartsWith) {
        return 1;
    }
    return sortChannelsByRecencyAndTypeAndDisplayName(wrappedA, wrappedB);
}

function isSearchableChannel(channel: ChannelItem) {
    return channel.type === Constants.OPEN_CHANNEL || channel.type === Constants.PRIVATE_CHANNEL;
}

function makeChannelSearchFilter(channelPrefix: string) {
    const channelPrefixLower = channelPrefix.toLowerCase();
    const splitPrefixBySpace = channelPrefixLower.trim().split(/[ ,]+/);
    const SEPARATOR = ';|;';

    return (channel: ChannelItem) => {
        let searchString = `${channel.display_name}${SEPARATOR}${channel.name}`;

        if (splitPrefixBySpace.length > 1) {
            const lowerCaseSearch = searchString.toLowerCase();
            return splitPrefixBySpace.every((searchPrefix) => {
                return lowerCaseSearch.includes(searchPrefix);
            });
        }

        return searchString.toLowerCase().includes(channelPrefixLower);
    };
}

export default class SwitchChannelProvider extends Provider {
    store = globalStore;

    /**
     * whenever this gets adjusted/refactored to not call the callback twice we need to adjust the behavior in
     * the ForwardPostChannelSelect component as well.
     *
     * @see {@link components/forward_post_modal/forward_post_channel_select.tsx}
     */
    handlePretextChanged(channelPrefix: string, resultsCallback: ResultsCallback<WrappedChannel>) {
        if (channelPrefix) {
            prefix = channelPrefix;
            this.startNewRequest(channelPrefix);
            if (this.shouldCancelDispatch(channelPrefix)) {
                return false;
            }

            // Dispatch suggestions for local channel data only (filter out deleted, archived, DM, and GM channels)
            let channels = getChannelsInAllTeams(this.store.getState()).filter((c) => c.delete_at === 0 && isSearchableChannel(c));
            channels = this.removeChannelsFromArchivedTeams(channels);
            const formattedData = this.formatGroup(channelPrefix, channels, true);
            if (formattedData) {
                resultsCallback(this.initialFilteredList(channelPrefix, formattedData));
            }

            // Fetch channel data from the server and dispatch
            this.fetchChannels(channelPrefix, resultsCallback);
        } else {
            resultsCallback({
                matchedPretext: '',
                groups: [],
            });
        }

        return true;
    }

    private initialFilteredList(channelPrefix: string, {items, terms}: {items: WrappedChannel[]; terms: string[]}): ProviderResults<WrappedChannel> {
        let groups;

        if (items) {
            groups = [{
                key: 'channels',
                label: defineMessage({id: 'suggestion.channels', defaultMessage: 'Channels'}),
                items,
                terms,
                component: ConnectedSwitchChannelSuggestion,
            }];
        } else {
            groups = [{
                key: 'moreChannels',
                label: defineMessage({id: 'suggestion.mention.morechannels', defaultMessage: 'Other Channels'}),
                items: [{type: '', loading: true}],
                terms: [''],
                component: ConnectedSwitchChannelSuggestion,
            }];
        }

        return {
            matchedPretext: channelPrefix,
            groups,
        };
    }

    async fetchChannels(channelPrefix: string, resultsCallback: ResultsCallback<WrappedChannel>) {
        const state = this.store.getState();
        const teamId = getCurrentTeamId(state);

        if (!teamId) {
            return;
        }

        const channelsAsync = this.store.dispatch(searchAllChannels(channelPrefix, {nonAdminSearch: true}));

        let channelsFromServer;

        try {
            const channelsResponse = await channelsAsync;
            channelsFromServer = (channelsResponse as ActionResult).data;
        } catch (err) {
            this.store.dispatch(logError(err));
            return;
        }

        if (this.shouldCancelDispatch(channelPrefix)) {
            return;
        }

        // filter out deleted, archived, DM, and GM channels from local store data
        let localChannelData = getChannelsInAllTeams(state).filter((c) => c.delete_at === 0 && isSearchableChannel(c)) || [];
        localChannelData = this.removeChannelsFromArchivedTeams(localChannelData);
        const localFormattedData = this.formatGroup(channelPrefix, localChannelData);
        let remoteChannelData = (channelsFromServer || []).filter(isSearchableChannel);
        remoteChannelData = this.removeChannelsFromArchivedTeams(remoteChannelData);

        const remoteFormattedData = this.formatGroup(channelPrefix, remoteChannelData, false);

        const combinedTerms = [...localFormattedData.terms, ...remoteFormattedData.terms.filter((term) => !localFormattedData.terms.includes(term))];
        const combinedItems = [...localFormattedData.items, ...remoteFormattedData.items.filter((item: any) => !localFormattedData.terms.includes(item.channel.id))];

        resultsCallback({
            matchedPretext: channelPrefix,
            groups: [{
                key: 'channels',
                label: defineMessage({id: 'suggestion.channels', defaultMessage: 'Channels'}),
                items: combinedItems,
                terms: combinedTerms,
                component: ConnectedSwitchChannelSuggestion,
            }],
        });
    }

    formatGroup(channelPrefix: string, allChannels: ChannelItem[], skipNotMember = true) {
        const channels = [];

        const members = getMyChannelMemberships(this.store.getState());

        const completedChannels: RelationOneToOne<Channel, boolean> = {};

        const channelFilter = makeChannelSearchFilter(channelPrefix);

        const state = this.store.getState();
        const allUnreadChannelIds = getAllTeamsUnreadChannelIds(state);
        const allUnreadChannelIdsSet = new Set(allUnreadChannelIds);

        for (const channel of allChannels) {
            if (completedChannels[channel.id]) {
                continue;
            }
            if (!isSearchableChannel(channel)) {
                continue;
            }
            if (channelFilter(channel)) {
                const newChannel = {...channel};
                const channelIsArchived = channel.delete_at !== 0;

                let wrappedChannel: WrappedChannel = {channel: newChannel, name: newChannel.name, deactivated: false};
                if (members[channel.id]) {
                    wrappedChannel.last_viewed_at = members[channel.id].last_viewed_at;
                } else if (skipNotMember && (newChannel.type !== Constants.THREADS)) {
                    continue;
                }

                if (channelIsArchived && members[channel.id]) {
                    wrappedChannel.type = Constants.ARCHIVED_CHANNEL;
                } else if (newChannel.type === Constants.OPEN_CHANNEL) {
                    wrappedChannel.type = Constants.MENTION_PUBLIC_CHANNELS;
                } else if (newChannel.type === Constants.PRIVATE_CHANNEL) {
                    wrappedChannel.type = Constants.MENTION_PRIVATE_CHANNELS;
                } else if (channelIsArchived && !members[channel.id]) {
                    continue;
                }

                const unread = allUnreadChannelIdsSet.has(newChannel.id) && !isChannelMuted(members[channel.id]);
                if (unread) {
                    wrappedChannel.unread = true;
                }
                completedChannels[channel.id] = true;
                channels.push(wrappedChannel);
            }
        }

        const channelNames = channels.
            sort(quickSwitchSorter).
            map((wrappedChannel) => {
                return wrappedChannel.channel.id;
            });

        return {
            items: channels,
            terms: channelNames,
        };
    }

    removeChannelsFromArchivedTeams(channels: Channel[]) {
        const state = this.store.getState();
        const activeTeams = getActiveTeamsList(state).map((team: Team) => team.id);
        const newChannels = channels.filter((channel: Channel) => {
            if (!channel.team_id) {
                return true;
            }
            return activeTeams.includes(channel.team_id);
        });
        return newChannels;
    }
}
