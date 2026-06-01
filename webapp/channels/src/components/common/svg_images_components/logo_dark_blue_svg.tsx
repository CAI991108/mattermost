// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import saiWordmark from 'images/sai-wordmark-light.png';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
    height?: number | string;
    width?: number | string;
};

const LogoDarkBlueSvg = ({
    alt = 'School of Artificial Intelligence',
    height = 30,
    style,
    width = 182,
    ...props
}: Props) => (
    <img
        {...props}
        alt={alt}
        height={height}
        src={saiWordmark}
        width={width}
        style={{
            display: 'block',
            filter: 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.85)) drop-shadow(0 0 3px rgba(255, 255, 255, 0.35))',
            objectFit: 'contain',
            ...style,
        }}
    />
);

export default LogoDarkBlueSvg;
