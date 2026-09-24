// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {PluginManifest} from '@mattermost/types/plugins';

import {loadPlugin} from './index';

jest.mock('stores/redux_store', () => ({
    __esModule: true,
    default: {
        dispatch: jest.fn(),
        getState: jest.fn(() => ({
            entities: {
                general: {
                    config: {
                        PluginsEnabled: 'true',
                    },
                },
                preferences: {
                    myPreferences: {},
                },
            },
        })),
    },
}));

jest.mock('utils/url', () => ({
    getSiteURL: () => 'http://localhost',
}));

describe('loadPlugin', () => {
    test('cache-busts the IUIN-customized Calls bundle', () => {
        const manifest = {
            id: 'com.mattermost.calls',
            name: 'Calls',
            version: '1.11.5',
            webapp: {
                bundle_path: '/static/com.mattermost.calls/calls_bundle.js',
            },
        } as PluginManifest;

        loadPlugin(manifest);

        expect(document.querySelector('#plugin_com\\.mattermost\\.calls')).toHaveAttribute(
            'src',
            'http://localhost/static/plugins/com.mattermost.calls/calls_bundle.js?iuin-branding=v1',
        );

        document.querySelector('#plugin_com\\.mattermost\\.calls')?.remove();
    });
});
