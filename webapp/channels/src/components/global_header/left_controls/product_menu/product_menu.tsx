// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {
    ProductsIcon,
} from '@mattermost/compass-icons/components';

import {isFreeEdition as isFreeEditionSelector} from 'mattermost-redux/selectors/entities/general';

import {getHistory} from 'utils/browser_history';

import ProductBranding from './product_branding';
import ProductBrandingFreeEdition from './product_branding_team_edition';

export const ProductMenuContainer = styled.nav`
    display: flex;
    align-items: center;
    cursor: pointer;

    > * + * {
        margin-left: 12px;
    }
`;

export const ProductMenuButton = styled.button.attrs(() => ({
    id: 'product_switch_menu',
    type: 'button',
}))`
    display: flex;
    align-items: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    padding: 6px 8px 6px 6px;

    &:hover, &:focus {
        color: rgba(var(--sidebar-text-rgb), 0.56);
        background-color: rgba(var(--sidebar-text-rgb), 0.08);
    }

    &:active {
        color: rgba(var(--sidebar-text-rgb), 0.56);
        background-color: rgba(var(--sidebar-text-rgb), 0.16);
    }

    > * + * {
        margin-left: 8px;
    }
`;

const ProductMenu = (): JSX.Element => {
    const {formatMessage} = useIntl();
    const isFreeEdition = useSelector(isFreeEditionSelector);

    const handleClick = () => getHistory().push('/');

    return (
        <ProductMenuContainer>
            <ProductMenuButton
                aria-label={formatMessage({id: 'global_header.productHome', defaultMessage: 'Go to Channels'})}
                onClick={handleClick}
            >
                <ProductsIcon
                    size={20}
                    color='rgba(var(--sidebar-text-rgb), 0.56)'
                />
                {isFreeEdition ? (
                    <ProductBrandingFreeEdition/>
                ) : (
                    <ProductBranding/>
                )}
            </ProductMenuButton>
        </ProductMenuContainer>
    );
};

export default ProductMenu;
