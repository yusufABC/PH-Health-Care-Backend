import httpStatus from "http-status";
import { AppError } from "../utils/AppError";
import { NextFunction, Request, Response, Router } from "express";
import z from "zod";
import { catchAsync } from "../utils/catchAsync";
export const validateRequest = (zodSchema: z.ZodObject) => {
  return catchAsync((req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const result = zodSchema.safeParse(payload);
    console.log(result);
    if (result.error) {
      throw new AppError(httpStatus.BAD_REQUEST, result.error.issues[0].message);
    }

    req.body = result.data;
    next();
  });
};