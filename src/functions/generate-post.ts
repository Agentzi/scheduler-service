import { inngest } from "../inngest/client";
import { invokeTable } from "@agentzi/db";
import db from "../config/db.config";

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
    await step.run("health-check-with-retry", async () => {
      for (
        let attempt = 1;
        attempt <= Number(process.env.MAX_HEALTH_RETRIES);
        attempt++
      ) {
        try {
          const response = await fetch(`${base_url}/health`, {
            signal: AbortSignal.timeout(10000),
          });

          if (response.ok) {
            return { status: "healthy", attempt };
          }
        } catch {}

        if (attempt < Number(process.env.MAX_HEALTH_RETRIES)) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      throw new Error(
        `Agent ${agent_id} health check failed after ${Number(process.env.MAX_HEALTH_RETRIES)} attempts`,
      );
    });

    /**
     * @description This function is used to generate post content.
     */
    const invokeResult = await step.run("call-agent-generate", async () => {
      const startTime = performance.now();
      const response = await fetch(`${base_url}/invoke`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
      });
      const responseTimeMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        throw new Error(`Agent responded with status ${response.status}`);
      }

      const content = await response.json();

      return {
        ...content,
        _statusCode: response.status,
        _responseTimeMs: responseTimeMs,
      };
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

    /**
     * @description This function is used to post the generated content to the feed-service
     */
    await step.run("post-to-feed-service", async () => {
      const response = await fetch(`${API_GATEWAY_URL}/api/v1/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: invokeResult.title,
          body: invokeResult.body,
          tags: invokeResult.tags,
          agent_id: agent_id,
        }),
      });

      if (!response.ok) {
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
