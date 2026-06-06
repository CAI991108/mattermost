// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {CSSTransition} from 'react-transition-group';
import styled from 'styled-components';

import completedImg from 'images/completed.svg';

const CompletedWrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 26px 24px 0 24px;
    margin: auto;
    text-align: center;
    word-break: break-word;
    width: 100%;
    height: 500px;

    &.fade-enter {
        transform: scale(0);
    }
    &.fade-enter-active {
        transform: scale(1);
    }
    &.fade-enter-done {
        transform: scale(1);
    }
    &.fade-exit {
        transform: scale(1);
    }
    &.fade-exit-active {
        transform: scale(1);
    }
    &.fade-exit-done {
        transform: scale(1);
    }
    .got-it-button {
        padding: 13px 20px;
        background: var(--button-bg);
        border-radius: 4px;
        color: var(--sidebar-text);
        border: none;
        font-weight: bold;
        margin-top: 15px;
        min-height: 40px;
        &:hover {
            background: var(--button-bg) !important;
            color: var(--sidebar-text) !important;
        }
    }

    h2 {
        font-size: 20px;
        margin: 0 0 10px;
        font-weight: 600;
    }

    .completed-subtitle {
        font-size: 14px !important;
        color: rgba(var(--center-channel-color-rgb), 0.75);
        line-height: 20px;
    }

    .completed-subtitle {
        margin-top: 5px;
    }

`;

interface Props {
    dismissAction: () => void;
    isCurrentUserSystemAdmin: boolean;
    isFirstAdmin: boolean;
}

const Completed = (props: Props): JSX.Element => {
    const {dismissAction} = props;

    return (
        <>
            <CSSTransition
                in={true}
                timeout={150}
                classNames='fade'
            >
                <CompletedWrapper>
                    <img
                        src={completedImg}
                        alt={'completed tasks image'}
                    />
                    <h2>
                        <FormattedMessage
                            id={'onboardingTask.checklist.completed_title'}
                            defaultMessage='Well done. You’ve completed all of the tasks!'
                        />
                    </h2>
                    <span className='completed-subtitle'>
                        <FormattedMessage
                            id={'onboardingTask.checklist.completed_subtitle'}
                            defaultMessage='We hope the workspace is more familiar now.'
                        />
                    </span>

                    <button
                        onClick={dismissAction}
                        className='got-it-button'
                    >
                        <FormattedMessage
                            id={'collapsed_reply_threads_modal.confirm'}
                            defaultMessage='Got it'
                        />
                    </button>
                </CompletedWrapper>
            </CSSTransition>
        </>
    );
};

export default Completed;
