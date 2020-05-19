// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import * as assert from 'assert';
import { ComponentClass, mount, ReactWrapper } from 'enzyme';
import * as React from 'react';
import { IStartPage } from '../../client/datascience/startPage/types';
import { StartPage } from '../../datascience-ui/startPage/startPage';
import { DataScienceIocContainer } from './dataScienceIocContainer';

suite('StartPage tests', () => {
    let start: IStartPage;
    let ioc: DataScienceIocContainer;

    setup(async () => {
        ioc = new DataScienceIocContainer();
        ioc.registerDataScienceTypes();
        await ioc.activate();
    });

    teardown(async () => {
        await ioc.dispose();
    });

    // tslint:disable-next-line: no-any
    function mountWebView(): ReactWrapper<any, Readonly<{}>, React.Component> {
        // Setup our webview panel
        ioc.createWebView(() => mount(<StartPage skipDefault={true} baseTheme={'vscode-light'} testMode={true} />));

        // Make sure the plot viewer provider and execution factory in the container is created (the extension does this on startup in the extension)
        start = ioc.get<IStartPage>(IStartPage);

        return ioc.wrapper!;
    }

    // tslint:disable:no-any
    function runMountedTest(
        name: string,
        testFunc: (wrapper: ReactWrapper<any, Readonly<{}>, React.Component>) => Promise<void>
    ) {
        test(name, async () => {
            const wrapper = mountWebView();
            try {
                await testFunc(wrapper);
            } finally {
                // Make sure to unmount the wrapper or it will interfere with other tests
                if (wrapper && wrapper.length) {
                    wrapper.unmount();
                }
            }
        });
    }

    function waitForComponentDidUpdate<P, S, C>(component: React.Component<P, S, C>): Promise<void> {
        return new Promise((resolve, reject) => {
            if (component) {
                let originalUpdateFunc = component.componentDidUpdate;
                if (originalUpdateFunc) {
                    originalUpdateFunc = originalUpdateFunc.bind(component);
                }

                // tslint:disable-next-line:no-any
                component.componentDidUpdate = (prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: any) => {
                    // When the component updates, call the original function and resolve our promise
                    if (originalUpdateFunc) {
                        originalUpdateFunc(prevProps, prevState, snapshot);
                    }

                    // Reset our update function
                    component.componentDidUpdate = originalUpdateFunc;

                    // Finish the promise
                    resolve();
                };
            } else {
                reject('Cannot find the component for waitForComponentDidUpdate');
            }
        });
    }

    function waitForRender<P, S, C>(component: React.Component<P, S, C>, numberOfRenders: number = 1): Promise<void> {
        // tslint:disable-next-line:promise-must-complete
        return new Promise((resolve, reject) => {
            if (component) {
                let originalRenderFunc = component.render;
                if (originalRenderFunc) {
                    originalRenderFunc = originalRenderFunc.bind(component);
                }
                let renderCount = 0;
                component.render = () => {
                    let result: React.ReactNode = null;

                    // When the render occurs, call the original function and resolve our promise
                    if (originalRenderFunc) {
                        result = originalRenderFunc();
                    }
                    renderCount += 1;

                    if (renderCount === numberOfRenders) {
                        // Reset our render function
                        component.render = originalRenderFunc;
                        resolve();
                    }

                    return result;
                };
            } else {
                reject('Cannot find the component for waitForRender');
            }
        });
    }

    async function waitForUpdate<P, S, C>(
        wrapper: ReactWrapper<P, S, C>,
        mainClass: ComponentClass<P>,
        numberOfRenders: number = 1
    ): Promise<void> {
        const mainObj = wrapper.find(mainClass).instance();
        if (mainObj) {
            // Hook the render first.
            const renderPromise = waitForRender(mainObj, numberOfRenders);

            // First wait for the update
            await waitForComponentDidUpdate(mainObj);

            // Force a render
            wrapper.update();

            // Wait for the render
            await renderPromise;

            // Force a render
            wrapper.update();
        }
    }

    async function waitForStartPage(wrapper: ReactWrapper<any, Readonly<{}>, React.Component>): Promise<void> {
        // Get a render promise with the expected number of renders
        const renderPromise = waitForUpdate(wrapper, StartPage, 1);

        // Call our function to add a plot
        await start.open();

        // Wait for all of the renders to go through
        await renderPromise;
    }

    const startPageDom =
        '<div class="title-row"><div class="title-icon"><i class="image-button-image"></i></div><div class="title">';

    runMountedTest('', async (wrapper) => {
        await waitForStartPage(wrapper);
        const dom = wrapper.getDOMNode();
        assert.ok(dom.innerHTML.includes(startPageDom), 'DOM is not loading correctly');
    });
});
