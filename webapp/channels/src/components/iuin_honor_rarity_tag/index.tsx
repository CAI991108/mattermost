// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';

import {
    getIuinHonorRarityClassName,
    getIuinHonorRarityLabel,
} from 'utils/iuin_honors';

import './iuin_honor_rarity_tag.scss';

type Props = {
    rarity?: string;
    className?: string;
    compact?: boolean;
};

export default function IuinHonorRarityTag({rarity, className, compact}: Props) {
    const label = getIuinHonorRarityLabel(rarity);

    return (
        <span
            className={classNames('iuin-honor-rarity-tag', getIuinHonorRarityClassName(rarity), {
                'iuin-honor-rarity-tag--compact': compact,
            }, className)}
            title={label}
            aria-label={label}
        >
            <span
                className='iuin-honor-rarity-tag__glow'
                aria-hidden={true}
            />
            <span
                className='iuin-honor-rarity-tag__dot'
                aria-hidden={true}
            />
            <span className='iuin-honor-rarity-tag__label'>{label}</span>
        </span>
    );
}
