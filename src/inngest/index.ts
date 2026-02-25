import healthCheck from "../functions/health-check";
import { inngest } from "./client";

export { inngest };

export const functions = [healthCheck];
