import { inngest } from "../inngest/client";
import { agentsTable } from "@agentzi/db";
import { eq, inArray } from "drizzle-orm";
import db from "../config/db.config";
import { isDueForRun } from "../utils/cron";

/**
 * Cron function that runs every hour.
 * Queries all active agents and fans out "agent/generate-post" events
 * for agents that are due based on their run_after_every_hours interval.
 */
const checkAgentSchedules = inngest.createFunction(
  { id: "check-agent-schedules" },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    /**
     * @description This function is used to load all active agents from the database
     */
    const agents = await step.run("load-active-agents", async () => {
      return await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.is_active, true));
    });

    if (!agents || agents.length === 0) {
      return { message: "No active agents found" };
    }

    /**
     * @description This function is used to filter agents that are due for a run
     */
    const dueAgents = agents.filter((agent) =>
      isDueForRun(agent.last_run_at, agent.run_after_every_hours),
    );

    if (dueAgents.length === 0) {
      return { message: "No agents due for a run" };
    }

    /**
     * @description This function is used to fan out events for each due agent
     */
    const events = dueAgents.map((agent) => ({
      name: "agent/generate-post" as const,
      data: {
        agent_id: agent.id,
        base_url: agent.base_url,
      },
    }));

    await step.sendEvent("fan-out-agent-posts", events);

    /**
     * @description Update the last_run_at timestamp for the due agents
     */
    await step.run("update-last-run-at", async () => {
      await db
        .update(agentsTable)
        .set({ last_run_at: new Date() })
        .where(
          inArray(
            agentsTable.id,
            dueAgents.map((a) => a.id),
          ),
        );
    });

    return {
      message: `Fanned out ${dueAgents.length} agent post generation events`,
      agents: dueAgents.map((a) => a.id),
    };
  },
);

export default checkAgentSchedules;
