import * as ppa from '@msrvida/python-program-analysis';
import { inject, injectable } from 'inversify';
import * as uuid from 'uuid/v4';
import { IApplicationShell, ICommandManager } from '../../common/application/types';
import { traceInfo } from '../../common/logger';
import { IConfigurationService, IDisposableRegistry } from '../../common/types';
import * as localize from '../../common/utils/localize';
// tslint:disable-next-line: no-duplicate-imports
import { Common } from '../../common/utils/localize';
import { Identifiers } from '../constants';
import { CellState, ICell as IVscCell, IGatherProvider } from '../types';

/**
 * An adapter class to wrap the code gathering functionality from [microsoft/python-program-analysis](https://www.npmjs.com/package/@msrvida/python-program-analysis).
 */
@injectable()
export class GatherProvider implements IGatherProvider {
    private _executionSlicer: ppa.ExecutionLogSlicer<ppa.Cell>;
    private dataflowAnalyzer: ppa.DataflowAnalyzer;
    private _enabled: boolean;

    constructor(
        @inject(IConfigurationService) private configService: IConfigurationService,
        @inject(IApplicationShell) private applicationShell: IApplicationShell,
        @inject(IDisposableRegistry) private disposables: IDisposableRegistry,
        @inject(ICommandManager) private commandManager: ICommandManager
    ) {
        this._enabled = this.configService.getSettings().datascience.enableGather ? true : false;

        this.dataflowAnalyzer = new ppa.DataflowAnalyzer();
        this._executionSlicer = new ppa.ExecutionLogSlicer(this.dataflowAnalyzer);

        if (this._enabled) {
            this.disposables.push(
                this.configService.getSettings(undefined).onDidChange(e => this.updateEnableGather(e))
            );
        }

        traceInfo('Gathering tools have been activated');
    }
    public logExecution(vscCell: IVscCell): void {
        const gatherCell = convertVscToGatherCell(vscCell);

        if (gatherCell) {
            this._executionSlicer.logExecution(gatherCell);
        }
    }

    public async resetLog(): Promise<void> {
        this._executionSlicer.reset();
    }

    /**
     * For a given code cell, returns a string representing a program containing all the code it depends on.
     */
    public gatherCode(vscCell: IVscCell): string {
        const gatherCell = convertVscToGatherCell(vscCell);
        if (!gatherCell) {
            return '';
        }

        // Get the default cell marker as we need to replace #%% with it.
        const defaultCellMarker =
            this.configService.getSettings().datascience.defaultCellMarker || Identifiers.DefaultCodeCellMarker;

        // Call internal slice method
        const slice = this._executionSlicer.sliceLatestExecution(gatherCell.persistentId);
        const program = slice.cellSlices.reduce(concat, '').replace(/#%%/g, defaultCellMarker);

        // Add a comment at the top of the file explaining what gather does
        const descriptor = localize.DataScience.gatheredScriptDescription();
        return descriptor.concat(program);
    }

    public get executionSlicer() {
        return this._executionSlicer;
    }

    public get enabled() {
        return this._enabled;
    }

    public set enabled(enabled: boolean) {
        this._enabled = enabled;
    }

    public async updateEnableGather(_e: void) {
        if (this.enabled !== this.configService.getSettings().datascience.enableGather) {
            this.enabled = this.configService.getSettings().datascience.enableGather ? true : false;
            const item = await this.applicationShell.showInformationMessage(
                localize.DataScience.reloadRequired(),
                Common.reload()
            );
            if (!item) {
                return;
            }
            if (item === 'Reload') {
                this.commandManager.executeCommand('workbench.action.reloadWindow');
            }
        }
    }
}

/**
 * Accumulator to concatenate cell slices for a sliced program, preserving cell structures.
 */
function concat(existingText: string, newText: ppa.CellSlice): string {
    // Include our cell marker so that cell slices are preserved
    return `${existingText}#%%\n${newText.textSliceLines}\n`;
}

/**
 * This is called to convert VS Code ICells to Gather ICells for logging.
 * @param cell A cell object conforming to the VS Code cell interface
 */
function convertVscToGatherCell(cell: IVscCell): ppa.Cell | undefined {
    // This should always be true since we only want to log code cells. Putting this here so types match for outputs property
    if (cell.data.cell_type === 'code') {
        const result: ppa.Cell = {
            // tslint:disable-next-line no-unnecessary-local-variable
            text: cell.data.source,

            executionCount: cell.data.execution_count,
            executionEventId: uuid(),

            persistentId: cell.id,
            hasError: cell.state === CellState.error
            // tslint:disable-next-line: no-any
        } as any;
        return result;
    }
}
