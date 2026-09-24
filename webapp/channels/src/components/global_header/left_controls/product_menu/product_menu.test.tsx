// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TopLevelProducts} from 'utils/constants';
import * as productUtils from 'utils/products';
import {TestHelper} from 'utils/test_helper';

import ProductMenu from './product_menu';

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

jest.mock('./product_menu_list', () => {
    return function MockProductMenuList() {
        return <div data-testid='product-menu-list'/>;
    };
});

jest.mock('components/onboarding_tasks', () => ({
    OnboardingTaskCategory: 'onboardingTask',
    OnboardingTasksName: {VISIT_SYSTEM_CONSOLE: 'visit_system_console'},
    TaskNameMapToSteps: {visit_system_console: {FINISHED: 999}},
    useHandleOnBoardingTaskData: () => jest.fn(),
}));

const spyProduct = jest.spyOn(productUtils, 'useCurrentProductId');
spyProduct.mockReturnValue(null);

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
        const products = [
            TestHelper.makeProduct(TopLevelProducts.BOARDS),
            TestHelper.makeProduct(TopLevelProducts.PLAYBOOKS),
        ];
        const spyProducts = jest.spyOn(productUtils, 'useProducts');
        spyProducts.mockReturnValue(products);
    });

    it('should render the product switcher button collapsed', () => {
        renderWithContext(
            <ProductMenu/>,
            baseState,
        );

        const button = screen.getByRole('button', {name: 'Product switch menu'});
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });

    it('should render Channels and product entries when the switcher menu is open', () => {
        const state = {
            ...baseState,
            views: {
                ...baseState.views,
                productMenu: {
                    switcherOpen: true,
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        const button = screen.getByRole('button', {name: 'Product switch menu'});
        expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getByText('Boards')).toBeInTheDocument();
        expect(screen.getByText('Playbooks')).toBeInTheDocument();
        expect(screen.getAllByRole('menuitem')).toHaveLength(3);
        expect(screen.getByTestId('product-menu-list')).toBeInTheDocument();
    });

    it('should render Channels when there are no top level products available', () => {
        const spyProducts = jest.spyOn(productUtils, 'useProducts');
        spyProducts.mockReturnValue([]);

        const state = {
            ...baseState,
            views: {
                ...baseState.views,
                productMenu: {
                    switcherOpen: true,
                },
            },
        };

        renderWithContext(
            <ProductMenu/>,
            state,
        );

        expect(screen.getByText('Channels')).toBeInTheDocument();
        expect(screen.getAllByRole('menuitem')).toHaveLength(1);
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
