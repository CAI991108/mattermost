// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {PureComponent} from 'react';
import {FormattedMessage} from 'react-intl';

import {buttonClassNames} from '@mattermost/shared/components/button';
import * as UserAgent from '@mattermost/shared/utils/user_agent';

import BrowserStore from 'stores/browser_store';

import ExternalLink from 'components/external_link';

import desktopImg from 'images/deep-linking/deeplinking-desktop-img.png';
import mobileImg from 'images/deep-linking/deeplinking-mobile-img.png';
import MattermostLogoSvg from 'images/logo.svg';
import {LandingPreferenceTypes} from 'utils/constants';

type Props = {
    desktopAppLink?: string;
    iosAppLink?: string;
    androidAppLink?: string;
    siteUrl?: string;
    siteName?: string;
    brandImageUrl?: string;
    enableCustomBrand: boolean;
}

type State = {
    rememberChecked: boolean;
    redirectPage: boolean;
    location: string;
    nativeLocation: string;
    brandImageError: boolean;
    navigating: boolean;
}

function safeRedirect(path: string) {
    const url = new URL(path);

    // Remove '/landing' from the end of the pathname
    url.pathname = url.pathname.slice(0, -'/landing'.length);

    const hash = url.hash.slice(1);
    const baseUrl = new URL(url.pathname, url.origin);

    // Default to base URL if no hash
    if (!hash) {
        return baseUrl.href;
    }

    let redirectUrl;

    try {
        // Attempt to construct URL from hash (handles both absolute and relative URLs)
        redirectUrl = new URL(hash, baseUrl);
    } catch (e) {
        // Invalid hash, return safe default
        return baseUrl.href;
    }

    // Only allow same-origin redirects
    if (redirectUrl.origin !== baseUrl.origin) {
        return baseUrl.href;
    }

    return redirectUrl.href;
}

export default class LinkingLandingPage extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        const finalLocation = safeRedirect(window.location.href);
        const nativeLocation = finalLocation.replace(/^(https|http)/, 'mattermost');

        this.state = {
            rememberChecked: false,
            redirectPage: false,
            location: finalLocation,
            nativeLocation,
            brandImageError: false,
            navigating: false,
        };

        if (!BrowserStore.hasSeenLandingPage()) {
            BrowserStore.setLandingPageSeen(true);
        }
    }

    componentDidMount() {
        if (this.checkLandingPreferenceApp()) {
            this.openMattermostApp();
        }

        window.addEventListener('beforeunload', this.clearLandingPreferenceIfNotChecked);
    }

    componentWillUnmount() {
        window.removeEventListener('beforeunload', this.clearLandingPreferenceIfNotChecked);
    }

    clearLandingPreferenceIfNotChecked = () => {
        if (!this.state.navigating && !this.state.rememberChecked) {
            BrowserStore.clearLandingPreference(this.props.siteUrl);
        }
    };

    checkLandingPreferenceBrowser = () => {
        const landingPreference = BrowserStore.getLandingPreference(this.props.siteUrl);
        return landingPreference && landingPreference === LandingPreferenceTypes.BROWSER;
    };

    isEmbedded = () => {
        // this cookie is set by any plugin that facilitates iframe embedding (e.g. mattermost-plugin-msteams-sync).
        const cookieName = 'MMEMBED';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(cookieName + '=')) {
                const value = cookie.substring(cookieName.length + 1);
                return decodeURIComponent(value) === '1';
            }
        }
        return false;
    };

    checkLandingPreferenceApp = () => {
        const landingPreference = BrowserStore.getLandingPreference(this.props.siteUrl);
        return landingPreference && landingPreference === LandingPreferenceTypes.MATTERMOSTAPP;
    };

    handleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.setState({rememberChecked: e.target.checked});

        // If it was checked, and now we're unchecking it, clear the preference
        if (!e.target.checked) {
            BrowserStore.clearLandingPreference(this.props.siteUrl);
        }
    };

    setPreference = (pref: string, clearIfNotChecked?: boolean) => {
        if (!this.state.rememberChecked) {
            if (clearIfNotChecked) {
                BrowserStore.clearLandingPreference(this.props.siteUrl);
            }
            return;
        }

        switch (pref) {
        case LandingPreferenceTypes.MATTERMOSTAPP:
            BrowserStore.setLandingPreferenceToMattermostApp(this.props.siteUrl);
            break;
        case LandingPreferenceTypes.BROWSER:
            BrowserStore.setLandingPreferenceToBrowser(this.props.siteUrl);
            break;
        default:
            break;
        }
    };

    openMattermostApp = () => {
        this.setPreference(LandingPreferenceTypes.MATTERMOSTAPP);
        this.setState({redirectPage: true});
        window.location.href = this.state.nativeLocation;
    };

    openInBrowser = () => {
        this.setPreference(LandingPreferenceTypes.BROWSER);
        window.location.href = this.state.location;
    };

    renderSystemDialogMessage = () => {
        const isMobile = UserAgent.isMobile();

        if (isMobile) {
            return (
                <FormattedMessage
                    id='get_app.systemDialogMessageMobile'
                    defaultMessage='View in App'
                />
            );
        }

        return (
            <FormattedMessage
                id='get_app.systemDialogMessage'
                defaultMessage='View in Desktop App'
            />
        );
    };

    renderGoNativeAppMessage = () => {
        return (
            <a
                href={UserAgent.isMobile() ? '#' : this.state.nativeLocation}
                onMouseDown={() => {
                    this.setPreference(LandingPreferenceTypes.MATTERMOSTAPP, true);
                }}
                onClick={() => {
                    this.setPreference(LandingPreferenceTypes.MATTERMOSTAPP, true);
                    this.setState({redirectPage: true, navigating: true});
                    if (UserAgent.isMobile()) {
                        if (UserAgent.isAndroid()) {
                            const timeout = setTimeout(() => {
                                window.location.replace(this.getDownloadLink()!);
                            }, 2000);
                            window.addEventListener('blur', () => {
                                clearTimeout(timeout);
                            });
                        }
                        window.location.replace(this.state.nativeLocation);
                    }
                }}
                className={buttonClassNames({emphasis: 'primary', size: 'lg'}, 'get-app__download')}
            >
                {this.renderSystemDialogMessage()}
            </a>
        );
    };

    getDownloadLink = () => {
        if (UserAgent.isIos()) {
            return this.props.iosAppLink;
        } else if (UserAgent.isAndroid()) {
            return this.props.androidAppLink;
        }

        return this.props.desktopAppLink;
    };

    handleBrandImageError = () => {
        this.setState({brandImageError: true});
    };

    renderGraphic = () => {
        const isMobile = UserAgent.isMobile();

        if (isMobile) {
            return (
                <img src={mobileImg}/>
            );
        }

        return (
            <img src={desktopImg}/>
        );
    };

    renderDownloadLinkSection = () => {
        if (this.state.redirectPage) {
            return (
                <div className='get-app__download-link'>
                    <FormattedMessage
                        id='getApp.downloadLinkInBrowser'
                        defaultMessage='Or, <a>open this link in your browser</a>.'
                        values={{
                            a: (chunks) => (
                                <ExternalLink
                                    href={this.state.location}
                                    location='landingPage'
                                >
                                    {chunks}
                                </ExternalLink>
                            ),
                        }}
                    />
                </div>
            );
        }

        return null;
    };

    renderDialogHeader = () => {
        let openingLink = (
                <FormattedMessage
                    id='get_app.openingLink'
                    defaultMessage='正在 IUIN Platform 中打开链接...'
                />
        );
        if (this.props.enableCustomBrand) {
            openingLink = (
                <FormattedMessage
                    id='get_app.openingLinkWhiteLabel'
                    defaultMessage='Opening link in {appName}...'
                    values={{
                        appName: this.props.siteName || 'IUIN Platform',
                    }}
                />
            );
        }

        if (this.state.redirectPage) {
            return (
                <h1 className='get-app__launching'>
                    {openingLink}
                    <div className={`get-app__alternative${this.state.redirectPage ? ' redirect-page' : ''}`}>
                        <FormattedMessage
                            id='get_app.redirectedInMoments'
                            defaultMessage='You will be redirected in a few moments.'
                        />
                        <br/>
                    </div>
                </h1>
            );
        }

        return (
            <div className='get-app__launching'>
                <FormattedMessage
                    id='get_app.launching'
                    tagName='h1'
                    defaultMessage='欢迎来到人工智能学院'
                />
            </div>
        );
    };

    renderDialogBody = () => {
        if (this.state.redirectPage) {
            return (
                <div className='get-app__dialog-body'>
                    {this.renderDialogHeader()}
                    {this.renderDownloadLinkSection()}
                </div>
            );
        }

        return (
            <div className='get-app__dialog-body'>
                {this.renderDialogHeader()}
                <div className='get-app__buttons'>
                    {this.renderGoNativeAppMessage()}
                    <a
                        href={this.state.location}
                        onMouseDown={() => {
                            this.setPreference(LandingPreferenceTypes.BROWSER, true);
                        }}
                        onClick={() => {
                            this.setPreference(LandingPreferenceTypes.BROWSER, true);
                            this.setState({navigating: true});
                        }}
                        className={buttonClassNames({emphasis: 'tertiary', size: 'lg'})}
                    >
                        <FormattedMessage
                            id='get_app.continueToBrowser'
                            defaultMessage='View in Browser'
                        />
                    </a>
                </div>
            </div>
        );
    };

    renderHeader = () => {
        let header = (
            <div className='get-app__header'>
                <img
                    src={MattermostLogoSvg}
                    className='get-app__logo'
                />
            </div>
        );
        if (this.props.enableCustomBrand && this.props.brandImageUrl) {
            let customLogo;
            if (this.props.brandImageUrl && !this.state.brandImageError) {
                customLogo = (
                    <img
                        src={this.props.brandImageUrl}
                        onError={this.handleBrandImageError}
                        className='get-app__custom-logo'
                    />
                );
            }

            header = (
                <div className='get-app__header'>
                    {customLogo}
                    <div className='get-app__custom-site-name'>
                        <span>{this.props.siteName}</span>
                    </div>
                </div>
            );
        }

        return header;
    };

    render() {
        const isMobile = UserAgent.isMobile();

        if (this.checkLandingPreferenceBrowser() || this.isEmbedded()) {
            this.openInBrowser();
            return null;
        }

        return (
            <div className='get-app'>
                {this.renderHeader()}
                <div className='get-app__dialog'>
                    <div
                        className={`get-app__graphic ${isMobile ? 'mobile' : ''}`}
                    >
                        {this.renderGraphic()}
                    </div>
                    {this.renderDialogBody()}
                </div>
            </div>
        );
    }
}
