
import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
    const userId=req.user?.userId

      if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  

   const result= await UserServices.uploadProfileImage(req.file?.buffer,userId!)

// console.log(req.file,"Req File Show");
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "New tokens generated successfully",
        data: result,
    });
})

export const UserController = {
    uploadProfileImage
}