// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';

import type {ProductIdentifier} from '@mattermost/types/products';

import Pluggable from 'plugins/pluggable';
import {isChannels} from 'utils/products';

import GlobalSearchNav from './global_search_nav/global_search_nav';
import KeyboardShortcutsButton from './keyboard_shortcuts_button';

const CenterControlsContainer = styled.div`
    display: flex;
    align-items: center;
    height: 100%;
    justify-content: center;
    flex-grow: 1;
    flex-basis: 40%;

    > * + * {
        margin-left: 8px;
    }
`;

export type Props = {
    productId?: ProductIdentifier;
}

const CenterControls = ({productId = null}: Props): JSX.Element => {
    return (
        <CenterControlsContainer>
            {isChannels(productId) ? (
                <>
                    <GlobalSearchNav/>
                    <KeyboardShortcutsButton/>
                </>
            ) : (
                <Pluggable
                    pluggableName={'Product'}
                    subComponentName={'headerCentreComponent'}
                    pluggableId={productId}
                />
            )}
        </CenterControlsContainer>
    );
};

export default CenterControls;
