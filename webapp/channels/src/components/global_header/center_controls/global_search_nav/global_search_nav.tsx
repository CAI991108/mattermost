// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import NewSearch from 'components/new_search/new_search';

import './global_search_nav.css';

const GlobalSearchNav = (): JSX.Element => {
    return (
        <div className='GlobalSearchNav'>
            <NewSearch/>
        </div>
    );
};

export default GlobalSearchNav;
