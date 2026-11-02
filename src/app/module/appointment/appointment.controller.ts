import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentServices } from "./appointment.service";



const bookAppointment = catchAsync(async (req: Request, res: Response) => {
    const payload =req.body
    const user =req.user!
    const result = await AppointmentServices.bookAppointment(payload,user)
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Appointment booked successfully",
        data: result,
    });
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
    const payload =req.body
    const user=req.user!
    const result = await AppointmentServices.payAppointment(payload,user)
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment processed successfully",
        data: result,
    });
});
const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
    const payload =req.body
    const user=req.user!
    const result = await AppointmentServices.cancelAppointment(payload, user)
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment cancelled and refunded successfully",
        data: result,
    });
});

const bookAppointmentCallback = catchAsync(async (req: Request, res: Response) => {

        const query = req.query
        console.log(query);

    const {executedPaymentResult, redirectUrl} = await AppointmentServices.bookAppointmentCallback(query)

    console.log(executedPaymentResult,"callback controller");
    
   res.redirect(redirectUrl)
});

const updateAppointmentStatus = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const user = req.user!
    const appointmentId = req.params.appointmentId as string

    const result = await AppointmentServices.updateAppointmentStatus(appointmentId, payload, user)

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Appointment status updated successfully",
        data: result,
    });
});


const getMyAppointments = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;

	const { data, meta } = await AppointmentServices.getMyAppointments(
		req.query,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointments Retrieved Successfully",
		data,
		meta,
	});
});

const getDoctorAppointments = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user!;

		const { data, meta } = await AppointmentServices.getDoctorAppointments(
			req.query,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointments Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AppointmentServices.getAllAppointments(
		req.query,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointments Retrieved Successfully",
		data,
		meta,
	});
});

const getSingleAppointment = catchAsync(async (req: Request, res: Response) => {
	const appointmentId = req.params.appointmentId as string;
	const user = req.user!;

	const result = await AppointmentServices.getSingleAppointment(
		appointmentId,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment Retrieved Successfully",
		data: result,
	});
});


export const AppointmentController = {
    bookAppointment,
    payAppointment,
    bookAppointmentCallback,
    cancelAppointment,
    updateAppointmentStatus,
    getMyAppointments,
    getDoctorAppointments,
    getAllAppointments,
    getSingleAppointment
}