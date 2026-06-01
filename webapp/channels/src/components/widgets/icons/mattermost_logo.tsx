// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import saiMark from 'images/sai-ai-mark.png';

type Props = React.HTMLAttributes<HTMLSpanElement>;

const MattermostLogo = (props: Props) => (
    <span
        {...props}
        aria-label='School of Artificial Intelligence'
        role='img'
    >
        <img
            alt=''
            aria-hidden='true'
            src={saiMark}
            style={{
                display: 'block',
                height: '100%',
                objectFit: 'contain',
                width: '100%',
            }}
        />
    </span>
);

export default MattermostLogo;
