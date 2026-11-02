import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { UpdateAppointmentStatusValidationZodSchema } from "./appointment.validation";

const router = Router();


router.post("/book-appointment",auth(Role.PATIENT),auth(Role.DOCTOR),
	validateRequest(UpdateAppointmentStatusValidationZodSchema), AppointmentController.bookAppointment)
router.post("/pay-appointment",auth(Role.PATIENT,Role.ADMIN,Role.SUPER_ADMIN), AppointmentController.payAppointment)
router.post("/cancel-appointment",auth(Role.PATIENT,Role.ADMIN,Role.SUPER_ADMIN), AppointmentController.cancelAppointment)
router.put("/update-appointment-status",auth(Role.DOCTOR), AppointmentController.updateAppointmentStatus)
//book appointment callback url 
router.get("/book-appointment/payment/callback",auth(Role.PATIENT), AppointmentController.bookAppointmentCallback )
router.patch(
	"/update-status/:appointmentId",
	AppointmentController.updateAppointmentStatus,
);

router.get(
	"/my-appointments",
	auth(Role.PATIENT),
	AppointmentController.getMyAppointments,
);

router.get(
	"/doctor-appointments",
	auth(Role.DOCTOR),
	AppointmentController.getDoctorAppointments,
);

router.get(
	"/all-appointments",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	AppointmentController.getAllAppointments,
);

router.get(
	"/:appointmentId",
	auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
	AppointmentController.getSingleAppointment,
);

export const AppointementRoutes = router;