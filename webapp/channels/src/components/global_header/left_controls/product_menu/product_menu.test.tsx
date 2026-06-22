// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen, userEvent} from 'tests/react_testing_utils';
import {getHistory} from 'utils/browser_history';

import ProductMenu from './product_menu';

const mockHistoryPush = jest.fn();

jest.mock('utils/browser_history', () => ({
    getHistory: jest.fn(() => ({
        push: mockHistoryPush,
    })),
}));

jest.mock('./product_branding', () => {
    return function MockProductBranding() {
        return <div data-testid='product-branding'/>;
    };
});

jest.mock('./product_branding_team_edition', () => {
    return function MockProductBrandingFreeEdition() {
        return <div data-testid='product-branding-free-edition'/>;
    };
});

describe('components/global/product_switcher', () => {
    const baseState = {
        entities: {
            general: {
                license: {
                    IsLicensed: 'true',
                },
            },
        },
        views: {
            productMenu: {
                switcherOpen: false,
            },
        },
    };

    beforeEach(() => {
        mockHistoryPush.mockClear();
        (getHistory as jest.Mock).mockClear();
    });

    it('should navigate to Channels when the logo card is clicked', async () => {
        renderWithContext(
            <ProductMenu/>,
            baseState,
        );

        await userEvent.click(screen.getByRole('button', {name: 'Go to Channels'}));

        expect(mockHistoryPush).toHaveBeenCalledWith('/');
    });

    it('should not render the product switcher accordion menu', () => {
        renderWithContext(
            <ProductMenu/>,
            baseState,
        );

        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
        expect(screen.queryByText('Channels')).not.toBeInTheDocument();
        expect(screen.queryByText('Download Apps')).not.toBeInTheDocument();
        expect(screen.queryByText('About IUIN Platform')).not.toBeInTheDocument();
    });

    it('should render ProductBrandingFreeEdition for Entry license', () => {
        const state = {
            ...baseState,
            entities: {
                ...baseState.entities,
                general: {
                    ...baseState.entities.general,
                    license: {
                        IsLicensed: 'true',
                        SkuShortName: 'entry',
                    },
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        expect(screen.getByTestId('product-branding-free-edition')).toBeInTheDocument();
        expect(screen.queryByTestId('product-branding')).not.toBeInTheDocument();
    });

    it('should render ProductBrandingFreeEdition for unlicensed', () => {
        const state = {
            ...baseState,
            entities: {
                ...baseState.entities,
                general: {
                    ...baseState.entities.general,
                    license: {
                        IsLicensed: 'false',
                    },
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        expect(screen.getByTestId('product-branding-free-edition')).toBeInTheDocument();
        expect(screen.queryByTestId('product-branding')).not.toBeInTheDocument();
    });

    it('should render ProductBranding for Professional license', () => {
        const state = {
            ...baseState,
            entities: {
                ...baseState.entities,
                general: {
                    ...baseState.entities.general,
                    license: {
                        IsLicensed: 'true',
                        SkuShortName: 'professional',
                    },
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        expect(screen.getByTestId('product-branding')).toBeInTheDocument();
        expect(screen.queryByTestId('product-branding-free-edition')).not.toBeInTheDocument();
    });

    it('should render ProductBranding for Enterprise license', () => {
        const state = {
            ...baseState,
            entities: {
                ...baseState.entities,
                general: {
                    ...baseState.entities.general,
                    license: {
                        IsLicensed: 'true',
                        SkuShortName: 'enterprise',
                    },
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        expect(screen.getByTestId('product-branding')).toBeInTheDocument();
        expect(screen.queryByTestId('product-branding-free-edition')).not.toBeInTheDocument();
    });
});
