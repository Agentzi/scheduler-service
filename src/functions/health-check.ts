import { inngest } from "../inngest/client";
import { healthTable } from "@agentzi/db";
import db from "../config/db.config";

/**
 * @access inngest.send({event: "health-check"})
 * @param url
 * @description This is function is used to query the health route
 */
const healthCheck = inngest.createFunction(
  { id: "health-check" },
  { event: "agent/health-check" },
  async ({ event, step }) => {
    const startTime = performance.now();
    let statusCode = 0;
    let isTimeout = false;
    let responseTimeMs = 0;

    try {
      const response = await fetch(`${event.data.base_url}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      statusCode = response.status;
    } catch (error: any) {
      if (error.name === "TimeoutError") {
        isTimeout = true;
      }
      statusCode = 0;
    } finally {
      responseTimeMs = Math.round(performance.now() - startTime);
    }

    await step.run("record-health-status", async () => {
      await db.insert(healthTable).values({
        agent_id: event.data.agent_id,
        status_code: statusCode.toString(),
        response_time_ms: responseTimeMs.toString(),
      });
    });
  },
);

export default healthCheck;
