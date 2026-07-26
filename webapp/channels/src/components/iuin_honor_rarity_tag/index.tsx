// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {defineMessages, useIntl} from 'react-intl';

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

const rarityMessages = defineMessages({
    common: {
        id: 'iuin_profile.honors.rarity.common',
        defaultMessage: 'Common',
    },
    rare: {
        id: 'iuin_profile.honors.rarity.rare',
        defaultMessage: 'Rare',
    },
    epic: {
        id: 'iuin_profile.honors.rarity.epic',
        defaultMessage: 'Epic',
    },
    hidden: {
        id: 'iuin_profile.honors.rarity.hidden',
        defaultMessage: 'Hidden',
    },
});

export default function IuinHonorRarityTag({rarity, className, compact}: Props) {
    const intl = useIntl();
    const normalizedRarity = getIuinHonorRarityLabel(rarity);
    const label = intl.formatMessage(rarityMessages[normalizedRarity]);

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
