// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {withRouter} from 'react-router-dom';

import {Permissions} from 'mattermost-redux/constants';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {haveITeamPermission, haveISystemPermission} from 'mattermost-redux/selectors/entities/roles';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import type {GlobalState} from 'types/store';

import BackstageController from './backstage_controller';

function mapStateToProps(state: GlobalState) {
    const user = getCurrentUser(state);
    const team = getCurrentTeam(state);

    const config = getConfig(state);

    const siteName = config.SiteName;
    const enableIncomingWebhooks = config.EnableIncomingWebhooks === 'true';
    const enableOutgoingWebhooks = config.EnableOutgoingWebhooks === 'true';
    const enableCommands = config.EnableCommands === 'true';
    const enableOAuthServiceProvider = config.EnableOAuthServiceProvider === 'true';
    const enableOutgoingOAuthConnections = config.EnableOutgoingOAuthConnections === 'true';

    const canManageTeamIntegrations = (
        haveITeamPermission(state, team?.id, Permissions.MANAGE_SLASH_COMMANDS) ||
        haveITeamPermission(state, team?.id, Permissions.MANAGE_OWN_SLASH_COMMANDS) ||
        haveITeamPermission(state, team?.id, Permissions.MANAGE_INCOMING_WEBHOOKS) ||
        haveITeamPermission(state, team?.id, Permissions.MANAGE_OWN_INCOMING_WEBHOOKS) ||
        haveITeamPermission(state, team?.id, Permissions.MANAGE_OUTGOING_WEBHOOKS) ||
        haveITeamPermission(state, team?.id, Permissions.MANAGE_OWN_OUTGOING_WEBHOOKS) ||
        haveISystemPermission(state, {permission: Permissions.MANAGE_OAUTH})
    );
    const canManageSystemBots = (haveISystemPermission(state, {permission: Permissions.MANAGE_BOTS}) || haveISystemPermission(state, {permission: Permissions.MANAGE_OTHERS_BOTS}));
    const canManageIntegrations = canManageTeamIntegrations || canManageSystemBots;

    return {
        user,
        team,
        siteName,
        enableIncomingWebhooks,
        enableOutgoingWebhooks,
        enableCommands,
        enableOAuthServiceProvider,
        enableOutgoingOAuthConnections,
        canManageIntegrations,
    };
}

export default withRouter(connect(mapStateToProps)(BackstageController));
