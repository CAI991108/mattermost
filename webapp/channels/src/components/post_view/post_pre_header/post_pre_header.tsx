// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, defineMessages, injectIntl} from 'react-intl';
import type {IntlShape} from 'react-intl';

export type Props = {
    intl: IntlShape;
    isPinned?: boolean;
    skipPinned?: boolean;
    channelId: string;
    actions: {
        showPinnedPosts: (channelId: string) => void;
    };
}

class PostPreHeader extends React.PureComponent<Props> {
    handleLinkClick = (channelId?: string) => {
        if (channelId) {
            this.props.actions.showPinnedPosts(channelId);
        }
    };

    render() {
        const {isPinned, skipPinned, channelId} = this.props;

        if (!isPinned || skipPinned) {
            return null;
        }

        return (
            <div className='post-pre-header'>
                <div className='post-pre-header__icons-container'>
                    {isPinned && !skipPinned && <span className='icon-pin icon icon--post-pre-header'/>}
                </div>
                <div className='post-pre-header__text-container'>
                    <span>
                        <a onClick={() => this.handleLinkClick(channelId)}>
                            <FormattedMessage
                                {...messages.pinned}
                            />
                        </a>
                    </span>
                </div>
            </div>
        );
    }
}

const messages = defineMessages({
    pinned: {
        id: 'post_pre_header.pinned',
        defaultMessage: 'Pinned',
    },
});

export default injectIntl(PostPreHeader);
