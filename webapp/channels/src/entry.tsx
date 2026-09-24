// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import ReactDOM from 'react-dom';
import ReactDOMClient from 'react-dom/client';

import {logError, LogErrorBarMode} from 'mattermost-redux/actions/errors';

import store from 'stores/redux_store';

import App from 'components/app';

import {AnnouncementBarTypes} from 'utils/constants';
import {setCSRFFromCookie} from 'utils/utils';

// Import our styles
import './sass/styles.scss';
import 'katex/dist/katex.min.css';

import '@mattermost/compass-icons/css/compass-icons.css';
import '@mattermost/components/dist/index.esm.css';

declare global {
    interface Window {
        publicPath?: string;
    }
}

const BUNDLE_RECOVERY_STORAGE_KEY = 'iuin_bundle_recovery_at';
const BUNDLE_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000;

function getErrorText(value: unknown): string {
    if (!value) {
        return '';
    }

    if (value instanceof Error) {
        return [value.name, value.message, value.stack].filter(Boolean).join(' ');
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'object') {
        const errorLike = value as {message?: unknown; name?: unknown; stack?: unknown};

        return [errorLike.name, errorLike.message, errorLike.stack].
            filter((part): part is string => typeof part === 'string').
            join(' ');
    }

    return String(value);
}

function isRecoverableBundleLoadError(message: unknown, url?: string, error?: unknown) {
    const errorText = [
        getErrorText(message),
        url || '',
        getErrorText(error),
    ].join(' ').toLowerCase();

    return (
        errorText.includes('chunkloaderror') ||
        errorText.includes('loading chunk') ||
        errorText.includes('loading css chunk') ||
        (errorText.includes('/static/') && errorText.includes('script error'))
    );
}

function isRecoverableStaticAssetError(event: Event) {
    const target = event.target;

    if (!(target instanceof HTMLScriptElement) && !(target instanceof HTMLLinkElement)) {
        return false;
    }

    const assetURL = target instanceof HTMLScriptElement ? target.src : target.href;

    if (!assetURL || (target instanceof HTMLLinkElement && target.rel !== 'stylesheet')) {
        return false;
    }

    try {
        const parsedURL = new URL(assetURL, window.location.href);

        if (parsedURL.origin !== window.location.origin || !parsedURL.pathname.includes('/static/')) {
            return false;
        }

        return (/\.(js|css)$/).test(parsedURL.pathname);
    } catch {
        return false;
    }
}

function shouldAttemptBundleRecovery() {
    const now = Date.now();

    try {
        const lastRecovery = Number(window.sessionStorage.getItem(BUNDLE_RECOVERY_STORAGE_KEY) || 0);

        if (lastRecovery && now - lastRecovery < BUNDLE_RECOVERY_COOLDOWN_MS) {
            return false;
        }

        window.sessionStorage.setItem(BUNDLE_RECOVERY_STORAGE_KEY, String(now));
    } catch {
        // If sessionStorage is unavailable, still try one recovery for this page load.
    }

    return true;
}

function recoverFromStaleBundleLoad() {
    if (!shouldAttemptBundleRecovery()) {
        return false;
    }

    const tasks: Array<Promise<unknown>> = [];

    if ('caches' in window) {
        tasks.push(
            window.caches.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key)))),
        );
    }

    if ('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
                registrations.map((registration) => registration.unregister()),
            )),
        );
    }

    Promise.allSettled(tasks).then(() => {
        const nextURL = new URL(window.location.href);

        nextURL.searchParams.set('cache_bust', String(Date.now()));
        window.location.replace(nextURL.toString());
    });

    return true;
}

// This is for anything that needs to be done for ALL react components.
// This runs before we start to render anything.
function preRenderSetup(onPreRenderSetupReady: () => void) {
    window.addEventListener('error', (event: Event) => {
        if (event instanceof ErrorEvent || !isRecoverableStaticAssetError(event)) {
            return;
        }

        if (recoverFromStaleBundleLoad()) {
            event.preventDefault();
        }
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
        if (!isRecoverableBundleLoadError(event.reason)) {
            return;
        }

        if (recoverFromStaleBundleLoad()) {
            event.preventDefault();
        }
    });

    window.onerror = (msg, url, line, column, error) => {
        if (msg === 'ResizeObserver loop limit exceeded') {
            return false;
        }

        if (isRecoverableBundleLoadError(msg, url, error) && recoverFromStaleBundleLoad()) {
            return true;
        }

        store.dispatch(
            logError(
                {
                    type: AnnouncementBarTypes.DEVELOPER,
                    message: 'A JavaScript error in the webapp client has occurred. (msg: ' + msg + ', row: ' + line + ', col: ' + column + ').',
                    stack: error?.stack,
                    url,
                },
                {errorBarMode: LogErrorBarMode.InDevMode},
            ),
        );

        return false;
    };

    setCSRFFromCookie();

    onPreRenderSetupReady();
}

function renderReactRootComponent() {
    const container = document.getElementById('root')!;

    if (localStorage.getItem('enable_concurrent_react_experimental') === 'true') {
        // eslint-disable-next-line no-console
        console.log(
            'Enabling concurrent React 18. To disable this, go to Settings > Advanced > Enable Concurrent React ' +
            '(Experimental) or clear your browser storage.',
        );

        // Enable this experimentally since it may cause other issues
        ReactDOMClient.createRoot(container).render(<App/>);
    } else {
        // We're using React 18, but we're using the deprecated way of starting React because ReactDOM.createRoot enables
        // new features such as automatic batching which breaks some components. This will need to be changed in the future
        // because this method of starting the app will be removed in React 19.
        ReactDOM.render(<App/>, container);
    }
}

/**
 * Adds a function to be invoked when the DOM content is loaded.
 */
function appendOnDOMContentLoadedEvent(onDomContentReady: () => void) {
    if (document.readyState === 'loading') {
        // If the DOM hasn't finished loading, add an event listener and call the function when it does
        document.addEventListener('DOMContentLoaded', onDomContentReady);
    } else {
        // If the DOM is already loaded, call the function immediately
        onDomContentReady();
    }
}

appendOnDOMContentLoadedEvent(() => {
    // Do the pre-render setup and call renderReactRootComponent when done
    preRenderSetup(renderReactRootComponent);
});
