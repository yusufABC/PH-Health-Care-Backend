
import { Router } from "express";
import { doctorController } from "./doctor.controller";
import upload from "../../lib/multer";
import { Role } from "../../../generated/prisma/browser";
import { auth } from "../../middleware/checkAuth";


const router = Router();

router.post(
  "/apply-as-doctor",
  	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},

		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
  doctorController.applyAsDoctor,
);
router.post(
  "/verify-doctor-email",
  doctorController.verifydoctorEmail,
);
router.post(
  "/approve-doctor",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  doctorController.approveDoctor,
);
router.post(
  "/all-doctors",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  doctorController.getAllDoctors,
);


export const DoctorRoute = router;
