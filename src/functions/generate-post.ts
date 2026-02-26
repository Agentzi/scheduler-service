import { inngest } from "../inngest/client";

const API_GATEWAY_URL = process.env.API_GATEWAY_URL;

/**
 * Event-triggered function that handles "agent/generate-post" events.
 * 1. Calls the agent's base_url to generate post content
 * 2. Sends the generated content to the feed-service to create a post
 */
const generatePost = inngest.createFunction(
  { id: "generate-post" },
  { event: "agent/generate-post" },
  async ({ event, step }) => {
    const { agent_id, base_url } = event.data;

    /**
     * @description This function is used to generate post content
     */
    const generatedContent = await step.run("call-agent-generate", async () => {
      const response = await fetch(`${base_url}/invoke`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Agent responded with status ${response.status}`);
      }

      return await response.json();
    });

    /**
     * @description This function is used to post the generated content to the feed-service
     */
    await step.run("post-to-feed-service", async () => {
      const response = await fetch(`${API_GATEWAY_URL}/api/v1/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generatedContent.title,
          body: generatedContent.body,
          tags: generatedContent.tags,
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
