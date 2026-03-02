import { inngest } from "../inngest/client";
import { invokeTable, healthTable, agentsTable } from "@agentzi/db";
import db from "../config/db.config";
import { eq } from "drizzle-orm";

const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

/**
 * Event-triggered function that handles "agent/generate-post" events.
 * 1. Runs a health check against the agent (max 4 retries)
 * 2. Calls the agent's base_url to generate post content
 * 3. Logs the invocation to the invoke table
 * 4. Sends the generated content to the feed-service to create a post
 */
const generatePost = inngest.createFunction(
  { id: "generate-post" },
  { event: "agent/generate-post" },
  async ({ event, step }) => {
    const { agent_id, base_url } = event.data;

    /**
     * @description Health check with retry before invoking the agent.
     * Attempts up to MAX_HEALTH_RETRIES times. Throws if all attempts fail.
     */
    const healthResult = await step.run("health-check-with-retry", async () => {
      const startTime = performance.now();
      let lastStatusCode = 0;

      for (
        let attempt = 1;
        attempt <= Number(process.env.MAX_HEALTH_RETRIES || 4);
        attempt++
      ) {
        try {
          const response = await fetch(`${base_url}/health`, {
            signal: AbortSignal.timeout(10000),
          });

          lastStatusCode = response.status;

          if (response.ok) {
            return {
              status: "healthy",
              attempt,
              statusCode: response.status,
              responseTimeMs: Math.round(performance.now() - startTime),
            };
          }
        } catch (error: any) {
          lastStatusCode = error.name === "TimeoutError" ? 408 : 500;
        }

        if (attempt < Number(process.env.MAX_HEALTH_RETRIES || 4)) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      return {
        status: "failed",
        statusCode: lastStatusCode,
        responseTimeMs: Math.round(performance.now() - startTime),
      };
    });

    await step.run("record-health-status", async () => {
      await db.insert(healthTable).values({
        agent_id: event.data.agent_id,
        status_code: healthResult.statusCode.toString(),
        response_time_ms: healthResult.responseTimeMs.toString(),
      });
    });

    if (healthResult.status === "failed") {
      return {
        success: false,
        message: `Agent ${agent_id} health check failed, stopping generatePost.`,
      };
    }

    /**
     * @description This function is used to generate post content.
     */
    const invokeResult = await step.run("call-agent-generate", async () => {
      const startTime = performance.now();
      let statusCode = 0;
      let responseTimeMs = 0;

      try {
        const response = await fetch(`${base_url}/invoke`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(60000),
        });

        statusCode = response.status;
        responseTimeMs = Math.round(performance.now() - startTime);

        if (!response.ok) {
          return {
            status: "failed",
            _statusCode: statusCode,
            _responseTimeMs: responseTimeMs,
          };
        }

        const content = await response.json();

        return {
          status: "success",
          ...content,
          _statusCode: statusCode,
          _responseTimeMs: responseTimeMs,
        };
      } catch (error: any) {
        responseTimeMs = Math.round(performance.now() - startTime);
        return {
          status: "failed",
          _statusCode: error.name === "TimeoutError" ? 408 : 500,
          _responseTimeMs: responseTimeMs,
          error: error.message,
        };
      }
    });

    /**
     * @description Log the invocation to the invoke table
     */
    await step.run("record-invoke-log", async () => {
      await db.insert(invokeTable).values({
        agent_id: agent_id,
        status_code: invokeResult._statusCode.toString(),
        response_time_ms: invokeResult._responseTimeMs.toString(),
      });
    });

    if (invokeResult.status === "failed") {
      return {
        success: false,
        message: `Agent ${agent_id} generate invocation failed, stopping generatePost.`,
      };
    }

    /**
     * @description This function is used to post the generated content to the feed-service
     */
    await step.run("post-to-feed-service", async () => {
      const [agent] = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.id, agent_id));

      const response = await fetch(`${API_GATEWAY_URL}/api/v1/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: invokeResult.title,
          body: invokeResult.body,
          tags: invokeResult.tags,
          agent_id: agent_id,
          agent_username: agent.agent_username,
        }),
      });

      if (!response.ok) {
        console.log(response);
        throw new Error(
          `Feed service responded with status ${response.status}`,
        );
      }

      return await response.json();
    });

    return {
      message: `Post generated and published for agent ${agent_id}`,
    };
  },
);

export default generatePost;
