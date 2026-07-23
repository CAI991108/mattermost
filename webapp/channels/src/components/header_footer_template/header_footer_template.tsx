// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';

type Props = {
    children?: React.ReactNode | React.ReactNodeArray;
}

const HeaderFooterNotLoggedIn = (props: Props) => {
    useEffect(() => {
        document.body.classList.add('sticky');
        const rootElement: HTMLElement | null = document.getElementById('root');
        if (rootElement) {
            rootElement.classList.add('container-fluid');
        }

        return () => {
            document.body.classList.remove('sticky');
            const rootElement: HTMLElement | null = document.getElementById('root');
            if (rootElement) {
                rootElement.classList.remove('container-fluid');
            }
        };
    }, []);

    return (
        <div className='inner-wrap'>
            <div className='row content'>
                {props.children}
            </div>
        </div>
    );
};

export default HeaderFooterNotLoggedIn;
