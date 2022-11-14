import type { StatOptions, StatsType } from "./stats";
import {
  ActionsComputer,
  ComboComputer,
  ConversionComputer,
  InputComputer,
  Stats,
  StockComputer,
  generateOverallStats,
} from "./stats";
import type { FrameEntryType, FramesType, GameEndType, GameStartType, MetadataType, RollbackFrames } from "./types";
import { SlpParser, SlpParserEvent } from "./utils/slpParser";
import { getInput, getMetadata, iterateEvents, openSlpFile, SlpInputSource } from "./reading";
import type { SlpReadInput } from "./reading/slpReader";

/**
 * Slippi Game class that wraps a file
 */
export class SlippiGame {
  private input: SlpReadInput;
  private metadata: MetadataType | null = null;
  private finalStats: StatsType | null = null;
  private parser: SlpParser;
  private readPosition: number | null = null;
  private actionsComputer: ActionsComputer = new ActionsComputer();
  private conversionComputer: ConversionComputer = new ConversionComputer();
  private comboComputer: ComboComputer = new ComboComputer();
  private stockComputer: StockComputer = new StockComputer();
  private inputComputer: InputComputer = new InputComputer();
  protected statsComputer: Stats;

  public constructor(input: string | ArrayBuffer | Uint8Array, opts?: StatOptions) {
    this.input = getInput(input);

    // Set up stats calculation
    this.statsComputer = new Stats(opts);
    this.statsComputer.register(
      this.actionsComputer,
      this.comboComputer,
      this.conversionComputer,
      this.inputComputer,
      this.stockComputer,
    );
    this.parser = new SlpParser();
    this.parser.on(SlpParserEvent.SETTINGS, (settings) => {
      this.statsComputer.setup(settings);
    });
    // Use finalized frames for stats computation
    this.parser.on(SlpParserEvent.FINALIZED_FRAME, (frame: FrameEntryType) => {
      this.statsComputer.addFrame(frame);
    });
  }

  private _process(settingsOnly = false): void {
    if (this.parser.getGameEnd() !== null) {
      return;
    }
    const slpfile = openSlpFile(this.input);
    this.readPosition = iterateEvents(
      slpfile,
      (command, payload) => {
        if (!payload) {
          // If payload is falsy, keep iterating. The parser probably just doesn't know
          // about this command yet
          return false;
        }
        this.parser.handleCommand(command, payload);
        return settingsOnly && this.parser.getSettings() !== null;
      },
      this.readPosition,
    );
  }

  /**
   * Gets the game settings, these are the settings that describe the starting state of
   * the game such as characters, stage, etc.
   */
  public getSettings(): GameStartType | null {
    // Settings is only complete after post-frame update
    this._process(true);
    return this.parser.getSettings();
  }

  public getLatestFrame(): FrameEntryType | null {
    this._process();
    return this.parser.getLatestFrame();
  }

  public getGameEnd(): GameEndType | null {
    this._process();
    return this.parser.getGameEnd();
  }

  public getFrames(): FramesType {
    this._process();
    return this.parser.getFrames();
  }

  public getRollbackFrames(): RollbackFrames {
    this._process();
    return this.parser.getRollbackFrames();
  }

  public getStats(): StatsType | null {
    if (this.finalStats) {
      return this.finalStats;
    }

    this._process();

    const settings = this.parser.getSettings();
    if (settings === null) {
      return null;
    }

    // Finish processing if we're not up to date
    this.statsComputer.process();
    const inputs = this.inputComputer.fetch();
    const stocks = this.stockComputer.fetch();
    const conversions = this.conversionComputer.fetch();
    const playableFrameCount = this.parser.getPlayableFrameCount();
    const overall = generateOverallStats({ settings, inputs, conversions, playableFrameCount });

    const stats = {
      gameComplete: this.parser.getGameEnd() !== null,
      lastFrame: this.parser.getLatestFrameNumber(),
      stocks,
      last_combo: this.comboComputer.fetch(),
      actionCounts: this.actionsComputer.fetch(),
      settings,
      inputs,
      overall,
    };

    if (this.parser.getGameEnd() !== null) {
      // If the game is complete, store a cached version of stats because it should not
      // change anymore. Ideally the statsCompuer.process and fetch functions would simply do no
      // work in this case instead but currently the conversions fetch function,
      // generateOverallStats, and maybe more are doing work on every call.
      this.finalStats = stats;
    }

    return stats;
  }

  public getMetadata(): MetadataType | null {
    if (this.metadata) {
      return this.metadata;
    }
    this.metadata = getMetadata(this.input);
    return this.metadata;
  }

  public getFilePath(): string | null {
    if (this.input.source !== SlpInputSource.FILE) {
      return null;
    }

    return this.input.filePath ?? null;
  }
}
