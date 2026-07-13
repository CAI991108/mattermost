// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback} from 'react';

import Timestamp from 'components/timestamp';

import UserDetails from './user_details';

import type {OptionValue} from '../types';

const TIME_SPEC: React.ComponentProps<typeof Timestamp> = {
    useTime: false,
    style: 'long',
    ranges: [
        {within: ['minute', -1], display: ['second', 0]},
        {within: ['hour', -1], display: ['minute']},
        {within: ['hour', -24], display: ['hour']},
        {within: ['day', -30], display: ['day']},
        {within: ['month', -11], display: ['month']},
        {within: ['year', -1000], display: ['year']},
    ],
};

export type Props = {
    option: OptionValue;
    isMobileView: boolean;
    isSelected: boolean;
    add: (value: OptionValue) => void;
    select: (value: OptionValue) => void;
}

const ListItem = React.forwardRef((props: Props, ref?: React.Ref<HTMLDivElement>) => {
    const {
        option,
        isMobileView,
        isSelected,
        add,
        select,
    } = props;

    const {last_post_at: lastPostAt} = option;

    const handleClick = useCallback(() => add(option), [option, add]);
    const handleMouseEnter = useCallback(() => select(option), [option, select]);

    return (
        <div
            ref={ref}
            className={classNames('more-modal__row clickable', {'more-modal__row--selected': isSelected})}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
        >
            <UserDetails option={option}/>

            {isMobileView && Boolean(lastPostAt) &&
                <div className='more-modal__lastPostAt'>
                    <Timestamp
                        {...TIME_SPEC}
                        value={lastPostAt}
                    />
                </div>
            }
        </div>
    );
});
ListItem.displayName = 'ListItem';

export default ListItem;
