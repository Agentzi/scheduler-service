import { Request, Response } from "express";
import HttpStatus from "../utils/http-status";
import { inngest } from "../inngest";

/**
 * @method POST
 * @access /health-check
 * @description This method is used to query a health route
 */
const HealthCheck = async (req: Request, res: Response) => {
  const { url, agent_id } = req.body;

  if (!url || !agent_id) {
    return res
      .status(HttpStatus.BAD_REQUEST)
      .json({ error: "Fields are missing" });
  }

  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    await inngest.send({
      name: "agent/health-check",
      data: {
        base_url: url,
        agent_id: agent_id,
      },
    });

    if (response.ok) {
      return res.status(HttpStatus.OK).json({ message: "UP" });
    } else {
      return res.status(response.status).json({
        message: "DOWN",
      });
    }
  } catch (error: any) {
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: "Internal Server Error",
      error: error,
    });
  }
};

export default HealthCheck;
