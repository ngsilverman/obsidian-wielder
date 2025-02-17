import { Plugin } from "obsidian";

export class IntervalsManager {
  private plugin: Plugin
  private activeIntervals: number[] = []

  constructor(plugin: Plugin) {
    this.plugin = plugin
  }

  public setInterval(handler: TimerHandler, intervalMs: number): number {
    // TODO Could we use the view's setInterval method to have it be automatically managed for us?
    const intervalId = window.setInterval(handler, intervalMs)
    this.plugin.registerInterval(intervalId)
    this.activeIntervals.push(intervalId)
    return intervalId
  }

  public killAll() {
    for (const intervalID of this.activeIntervals) {
      clearInterval(intervalID)
    }
    this.activeIntervals = []
  }
}
