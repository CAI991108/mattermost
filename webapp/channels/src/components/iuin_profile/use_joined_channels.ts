// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useMemo, useState} from 'react';
import {useSelector} from 'react-redux';

import type {Team} from '@mattermost/types/teams';

import {Client4} from 'mattermost-redux/client';
import {getMyTeams} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

export function useIuinJoinedTeamLabels(userId: string, enabled = true): string[] {
    const currentUser = useSelector(getCurrentUser);
    const myTeams = useSelector(getMyTeams);
    const [fetchedJoinedTeams, setFetchedJoinedTeams] = useState<string[] | null>(null);

    const storeJoinedTeams = useMemo(() => {
        if (!enabled || currentUser?.id !== userId) {
            return [];
        }

        return getJoinedTeamLabels(myTeams);
    }, [currentUser?.id, enabled, myTeams, userId]);

    useEffect(() => {
        if (!enabled || !userId) {
            setFetchedJoinedTeams([]);
            return undefined;
        }

        let isMounted = true;
        setFetchedJoinedTeams(null);

        async function loadJoinedTeams() {
            const teams = currentUser?.id === userId ? await Client4.getMyTeams() : await Client4.getTeamsForUser(userId);

            if (isMounted) {
                setFetchedJoinedTeams(getJoinedTeamLabels(teams));
            }
        }

        loadJoinedTeams().catch(() => {
            if (isMounted) {
                setFetchedJoinedTeams(null);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [currentUser?.id, enabled, userId]);

    if (!enabled) {
        return [];
    }

    return fetchedJoinedTeams ?? storeJoinedTeams;
}

function getJoinedTeamLabels(teams: Team[]): string[] {
    return teams.
        filter((team) => team.delete_at === 0).
        map((team) => (team.display_name || team.name).trim()).
        filter(Boolean).
        sort((a, b) => a.localeCompare(b));
}
