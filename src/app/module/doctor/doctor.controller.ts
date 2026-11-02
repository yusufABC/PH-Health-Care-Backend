import { AppError } from "../../utils/AppError";
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from 'http-status'
import {  DoctorServices } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";


const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {

    	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	console.log({ files });
	const resume = files?.["resume"] ? files["resume"][0] : null;
	const additionalFiles = files?.["additionalFiles"] || [];
	const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(
		JSON.parse(req.body.data),
	);

	if (!zodValidationResult.success) {
		throw new AppError(httpStatus.BAD_REQUEST, zodValidationResult.error.issues[0].message);
	}

	const payload = zodValidationResult.data;
	const result= await DoctorServices.applyAsDoctor(payload,
		resume,
		additionalFiles,);



	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Applied as doctor successfull",
		data: result
	});
});

const verifydoctorEmail = catchAsync(async (req: Request, res: Response) => {

    	

	const payload = req.body;
	const result= await DoctorServices.vefiryDoctorEmail(payload);



	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Verify doctor successfull",
		data: result
	});
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {

    	

	const payload = req.body;
	const user = req.user!
	const result= await DoctorServices.approveDoctor(payload,user);



	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Approve doctor successfull",
		data: result
	});
});


const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	

	const {data, meta} = await DoctorServices.getAllDoctors(req.query)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data: data,
		meta : meta,
	});
});

export const doctorController={
    applyAsDoctor,
    verifydoctorEmail,
	approveDoctor,
	getAllDoctors
}