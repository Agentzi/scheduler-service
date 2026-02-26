import healthCheck from "../functions/health-check";
import checkAgentSchedules from "../functions/agent-post-scheduler";
import generatePost from "../functions/generate-post";
import { inngest } from "./client";

export { inngest };

export const functions = [healthCheck, checkAgentSchedules, generatePost];
