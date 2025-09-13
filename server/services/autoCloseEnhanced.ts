import * as cron from "node-cron";
import Game from "../models/Game";
import { istMidnightUTCms, hmToMinutes } from "../utils/time";

class AutoCloseEnhancedService {
  private static instance: AutoCloseEnhancedService;
  private isRunning = false;
  private cronJob?: cron.ScheduledTask;

  static getInstance(): AutoCloseEnhancedService {
    if (!AutoCloseEnhancedService.instance) {
      AutoCloseEnhancedService.instance = new AutoCloseEnhancedService();
    }
    return AutoCloseEnhancedService.instance;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log("🔒 Auto-Close Enhanced Service already running");
      return;
    }

    console.log("🚀 Starting Enhanced Auto-Close Service...");

    // Run initial sweep on startup
    await this.runSweep();

    // Schedule to run every 30 seconds
    this.cronJob = cron.schedule(
      "*/30 * * * * *",
      async () => {
        await this.runSweep();
      },
      { scheduled: true } as any, // keep typings simple across node-cron versions
    );

    // Daily recompute of UTC fields at 00:05 IST
    cron.schedule(
      "5 0 * * *",
      async () => {
        try {
          await this.updateGameUTCTimes(true);
        } catch (e) {
          console.error("❌ Daily UTC recompute failed:", e);
        }
      },
      { scheduled: true } as any,
    );

    this.isRunning = true;
    console.log(
      "✅ Enhanced Auto-Close Service started (runs every 30 seconds)",
    );
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
    }
    this.isRunning = false;
    console.log("🛑 Enhanced Auto-Close Service stopped");
  }

  private async runSweep(): Promise<void> {
    try {
      const nowUTC = new Date();
      console.log(
        `🕐 [${nowUTC.toISOString()}] Running enhanced timing sweep...`,
      );

      const games = await Game.find({ isActive: true }).select(
        "name startTime endTime resultTime currentStatus acceptingBets declaredResult startTimeUTC endTimeUTC resultTimeUTC",
      );

      let opened = 0;
      let closed = 0;
      let resultsTriggered = 0;

      for (const game of games) {
        const status = this.computeStatus(
          game.startTime,
          game.endTime,
          game.resultTime,
        );

        if (status === "open") {
          if (game.currentStatus !== "open" || game.acceptingBets === false) {
            await Game.findByIdAndUpdate(game._id, {
              $set: {
                currentStatus: "open",
                acceptingBets: true,
                lastStatusChange: nowUTC,
              },
              $unset: { forcedStatus: "" },
            });
            opened++;
          }
        } else if (status === "closed") {
          if (game.currentStatus !== "closed" || game.acceptingBets !== false) {
            await Game.findByIdAndUpdate(game._id, {
              $set: {
                currentStatus: "closed",
                acceptingBets: false,
                autoClosedAt: nowUTC,
                lastStatusChange: nowUTC,
              },
            });
            closed++;
          }
        } else if (status === "result_time") {
          if (!game.declaredResult) {
            await Game.findByIdAndUpdate(game._id, {
              $set: {
                currentStatus: "closed",
                acceptingBets: false,
                isResultPending: true,
                lastStatusChange: nowUTC,
              },
            });
            resultsTriggered++;
          }
        }
      }

      console.log(
        `📈 Sweep summary → opened:${opened} closed:${closed} result_pending:${resultsTriggered}`,
      );
    } catch (error) {
      console.error("❌ Error in enhanced timing sweep:", error);
    }
  }

  // Helper: update UTC fields from IST strings (recomputed daily or on demand)
  public async updateGameUTCTimes(force: boolean = false): Promise<void> {
    try {
      console.log("🔄 Updating game UTC times from IST...");

      const games = await Game.find({ isActive: true });
      const today = new Date();

      for (const game of games) {
        if (force || game.endTime) {
          const { startUTC, endUTC, resultUTC } = this.computeUTCTimesForCycle(
            today,
            game.startTime,
            game.endTime,
            game.resultTime,
          );

          await Game.findByIdAndUpdate(game._id, {
            startTimeUTC: startUTC,
            endTimeUTC: endUTC,
            resultTimeUTC: resultUTC,
          });

          console.log(
            `  ├─ ${game.name}: start ${startUTC?.toISOString()} | end ${endUTC?.toISOString()} | result ${resultUTC?.toISOString()}`,
          );
        }
      }

      console.log("✅ Game UTC times updated");
    } catch (error) {
      console.error("❌ Error updating game UTC times:", error);
    }
  }

  private convertISTtoUTC(baseDate: Date, timeStr: string): Date {
    // Build UTC epoch for given IST HH:mm on the IST date of baseDate
    const midnightUTC = istMidnightUTCms(baseDate);
    const minutes = hmToMinutes(timeStr);
    return new Date(midnightUTC + minutes * 60 * 1000);
  }

  private computeUTCTimesForCycle(
    baseDate: Date,
    start: string,
    end: string,
    result: string,
  ) {
    const startM = hmToMinutes(start);
    const endM = hmToMinutes(end);
    const resultM = hmToMinutes(result);

    // Anchor to midnight IST of baseDate (expressed in UTC epoch)
    const midnightUTC = istMidnightUTCms(baseDate);

    // Start
    const startUTC = new Date(midnightUTC + startM * 60 * 1000);

    // End (may roll to next day if end < start)
    const endDayOffset = endM < startM ? 1440 : 0; // minutes
    const endUTC = new Date(midnightUTC + (endM + endDayOffset) * 60 * 1000);

    // Result relative to end (roll to next day if earlier than end time)
    const resultDayOffset = resultM < endM ? 1440 : 0;
    const resultUTC = new Date(midnightUTC + (resultM + resultDayOffset) * 60 * 1000);

    return { startUTC, endUTC, resultUTC };
  }

  private computeStatus(
    start: string,
    end: string,
    result: string,
  ): "waiting" | "open" | "closed" | "result_time" {
    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const nowUTC = new Date();
    const nowIST = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
    const currentM = nowIST.getHours() * 60 + nowIST.getMinutes();
    const startM = toMinutes(start);
    const endM = toMinutes(end);
    const resultM = toMinutes(result);

    if (endM > startM) {
      // same-day close
      if (currentM >= startM && currentM < endM) return "open";
      if (resultM >= endM) {
        if (currentM >= endM && currentM < resultM) return "closed";
        if (currentM >= resultM) return "result_time";
      } else {
        // result next day
        if (currentM >= endM) return "closed";
        if (currentM < startM && currentM >= resultM) return "result_time";
      }
      return "waiting";
    } else {
      // cross-day close (end next day)
      if (currentM >= startM || currentM < endM) return "open";
      if (resultM > endM) {
        if (currentM >= endM && currentM < resultM) return "closed";
        if (currentM >= resultM && currentM < startM) return "result_time";
      } else {
        if ((currentM >= endM && currentM < 1440) || currentM < resultM)
          return "closed";
        if (currentM >= resultM && currentM < startM) return "result_time";
      }
      return "waiting";
    }
  }

  public getStatus(): { isRunning: boolean; nextRunTime?: string } {
    return {
      isRunning: this.isRunning,
      nextRunTime: this.cronJob ? "Every 30 seconds" : undefined,
    };
  }
}

export default AutoCloseEnhancedService;
