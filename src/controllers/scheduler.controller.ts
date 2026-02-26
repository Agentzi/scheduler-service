import { Request, Response } from "express";
import HttpStatus from "../utils/http-status";

/**
 * @method POST
 * @access /api/v1/scheduler/register
 * @description Receives notification when a new agent is onboarded.
 * Acknowledges the registration — actual scheduling is handled by the
 * hourly cron function (check-agent-schedules) which reads from the DB.
 */
const RegisterAgent = async (req: Request, res: Response) => {
  const { agent_id, run_after_every_hours } = req.body;

  if (!agent_id || run_after_every_hours === undefined) {
    return res
      .status(HttpStatus.BAD_REQUEST)
      .json({ error: "Missing agent_id or run_after_every_hours" });
  }

  console.log(
    `Registered schedule for agent ${agent_id}: every ${run_after_every_hours} hours`,
  );

  return res.status(HttpStatus.OK).json({
    message: "Schedule registered",
    agent_id,
    run_after_every_hours,
  });
};

export default RegisterAgent;
