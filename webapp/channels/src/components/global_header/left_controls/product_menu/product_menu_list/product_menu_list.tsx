// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import {
    AccountMultipleOutlineIcon,
    ApplicationCogIcon,
    ViewGridPlusOutlineIcon,
} from '@mattermost/compass-icons/components';
import type {UserProfile} from '@mattermost/types/users';

import {Permissions} from 'mattermost-redux/constants';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';

import {VisitSystemConsoleTour} from 'components/onboarding_tasks';
import SystemPermissionGate from 'components/permissions_gates/system_permission_gate';
import TeamPermissionGate from 'components/permissions_gates/team_permission_gate';
import MarketplaceModal from 'components/plugin_marketplace/marketplace_modal';
import UserGroupsModal from 'components/user_groups_modal';
import Menu from 'components/widgets/menu/menu';
import RestrictedIndicator from 'components/widgets/menu/menu_items/restricted_indicator';

import {FREEMIUM_TO_ENTERPRISE_TRIAL_LENGTH_DAYS} from 'utils/cloud_utils';
import {LicenseSkus, ModalIdentifiers, MattermostFeatures} from 'utils/constants';

import type {ModalData} from 'types/actions';

import './product_menu_list.scss';

export type Props = {
    isMobile: boolean;
    teamId?: string;
    teamName?: string;
    siteName: string;
    currentUser: UserProfile;
    appDownloadLink: string;
    isMessaging: boolean;
    enableCommands: boolean;
    enableIncomingWebhooks: boolean;
    enableOAuthServiceProvider: boolean;
    enableOutgoingWebhooks: boolean;
    canManageSystemBots: boolean;
    canManageIntegrations: boolean;
    enablePluginMarketplace: boolean;
    showVisitSystemConsoleTour: boolean;
    isStarterFree: boolean;
    isFreeTrial: boolean;
    onClick?: React.MouseEventHandler<HTMLElement>;
    handleVisitConsoleClick: React.MouseEventHandler<HTMLElement>;
    enableCustomUserGroups?: boolean;
    actions: {
        openModal: <P>(modalData: ModalData<P>) => void;
        getPrevTrialLicense: () => void;
    };
};

const ProductMenuList = (props: Props): JSX.Element | null => {
    const {
        teamId,
        currentUser,
        isMessaging,
        enablePluginMarketplace,
        showVisitSystemConsoleTour,
        isStarterFree,
        isFreeTrial,
        onClick,
        handleVisitConsoleClick,
        isMobile = false,
        enableCustomUserGroups,
    } = props;
    const {formatMessage} = useIntl();
    const isAdmin = useSelector(isCurrentUserSystemAdmin);

    useEffect(() => {
        props.actions.getPrevTrialLicense();
    }, []);

    if (!currentUser) {
        return null;
    }

    const openGroupsModal = () => {
        props.actions.openModal({
            modalId: ModalIdentifiers.USER_GROUPS,
            dialogType: UserGroupsModal,
            dialogProps: {
                backButtonAction: openGroupsModal,
            },
        });
    };

    return (
        <Menu.Group
            divider={(
                <TeamPermissionGate
                    teamId={teamId}
                    permissions={[Permissions.SYSCONSOLE_WRITE_PLUGINS]}
                >
                    <li
                        className='MenuGroup menu-divider'
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        role='separator'
                    />
                </TeamPermissionGate>
            )}
        >
                <div onClick={onClick}>
                    <Menu.CloudTrial id='menuCloudTrial'/>
                    <Menu.ItemCloudLimit id='menuItemCloudLimit'/>
                    <SystemPermissionGate permissions={Permissions.SYSCONSOLE_READ_PERMISSIONS}>
                        <Menu.ItemLink
                            id='systemConsole'
                            show={!isMobile}
                            to='/admin_console'
                            text={(
                                <>
                                    {formatMessage({id: 'navbar_dropdown.console', defaultMessage: 'System Console'})}
                                    {showVisitSystemConsoleTour && (
                                        <div
                                            onClick={handleVisitConsoleClick}
                                            className={'system-console-visit'}
                                        >
                                            <VisitSystemConsoleTour/>
                                        </div>
                                    )}
                                </>
                            )}
                            icon={<ApplicationCogIcon size={18}/>}
                        />
                    </SystemPermissionGate>
                    {/* LZX修改，前端隐藏 Integrations 入口，保留背后权限/路由逻辑。 */}
                    <Menu.ItemToggleModalRedux
                        id='userGroups'
                        modalId={ModalIdentifiers.USER_GROUPS}
                        show={enableCustomUserGroups || isStarterFree || isFreeTrial}
                        dialogType={UserGroupsModal}
                        dialogProps={{
                            backButtonAction: openGroupsModal,
                        }}
                        text={formatMessage({id: 'navbar_dropdown.userGroups', defaultMessage: 'User Groups'})}
                        icon={<AccountMultipleOutlineIcon size={18}/>}
                        disabled={isStarterFree}
                        sibling={(isAdmin && (isStarterFree || isFreeTrial)) && (
                            <RestrictedIndicator
                                blocked={isStarterFree}
                                feature={MattermostFeatures.CUSTOM_USER_GROUPS}
                                minimumPlanRequiredForFeature={LicenseSkus.Professional}
                                tooltipMessage={formatMessage({
                                    id: 'navbar_dropdown.userGroups.tooltip.cloudFreeTrial',
                                    defaultMessage: 'During your trial you are able to create user groups. These user groups will be archived after your trial.',
                                })}
                                titleAdminPreTrial={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.titleAdminPreTrial',
                                    defaultMessage: 'Try unlimited user groups with a free trial',
                                })}
                                messageAdminPreTrial={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.messageAdminPreTrial',
                                    defaultMessage: 'Create unlimited user groups with one of our paid plans. Get the full experience of Enterprise when you start a free, {trialLength} day trial.',
                                },
                                {
                                    trialLength: FREEMIUM_TO_ENTERPRISE_TRIAL_LENGTH_DAYS,
                                },
                                )}
                                titleAdminPostTrial={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.titleAdminPostTrial',
                                    defaultMessage: 'Upgrade to create unlimited user groups',
                                })}
                                messageAdminPostTrial={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.messageAdminPostTrial',
                                    defaultMessage: 'User groups are a way to organize users and apply actions to all users within that group. Upgrade to the Professional plan to create unlimited user groups.',
                                })}
                                titleEndUser={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.titleEndUser',
                                    defaultMessage: 'User groups available in paid plans',
                                })}
                                messageEndUser={formatMessage({
                                    id: 'navbar_dropdown.userGroups.modal.messageEndUser',
                                    defaultMessage: 'User groups are a way to organize users and apply actions to all users within that group.',
                                })}
                            />
                        )}
                    />
                    <TeamPermissionGate
                        teamId={teamId}
                        permissions={[Permissions.SYSCONSOLE_WRITE_PLUGINS]}
                    >
                        <Menu.ItemToggleModalRedux
                            id='marketplaceModal'
                            modalId={ModalIdentifiers.PLUGIN_MARKETPLACE}
                            show={isMessaging && !isMobile && enablePluginMarketplace}
                            dialogType={MarketplaceModal}
                            text={formatMessage({id: 'navbar_dropdown.marketplace', defaultMessage: 'App Marketplace'})}
                            icon={<ViewGridPlusOutlineIcon size={18}/>}
                        />
                    </TeamPermissionGate>
                    {/* LZX修改，前端隐藏 Download Apps 入口，保留 AppDownloadLink 配置和外链组件逻辑。 */}
                    {/* LZX修改，前端隐藏 About 入口，保留 AboutBuildModal 组件逻辑。 */}
                </div>
            </Menu.Group>

    );
};

export default ProductMenuList;
