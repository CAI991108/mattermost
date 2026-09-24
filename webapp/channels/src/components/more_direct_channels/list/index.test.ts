// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import TestHelper from 'packages/mattermost-redux/test/test_helper';

import {getOptions} from './index';

describe('getOptions', () => {
    test('returns active users sorted by username', () => {
        const zoe = TestHelper.fakeUserWithId();
        zoe.username = 'zoe';
        const amy = TestHelper.fakeUserWithId();
        amy.username = 'amy';

        expect(getOptions([zoe, amy])).toEqual([
            {...amy, last_post_at: 0},
            {...zoe, last_post_at: 0},
        ]);
    });

    test('filters out deleted users', () => {
        const activeUser = TestHelper.fakeUserWithId();
        activeUser.delete_at = 0;
        const deletedUser = TestHelper.fakeUserWithId();
        deletedUser.delete_at = 1000;

        expect(getOptions([deletedUser, activeUser])).toEqual([
            {...activeUser, last_post_at: 0},
        ]);
    });
});
