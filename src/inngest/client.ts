import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: process.env.APP_ID || "scheduler-service",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
