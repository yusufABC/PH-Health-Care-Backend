import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { Router } from "express";
import { UserValidation } from "./authZodValidation";

const router = Router();

router.post(
  "/register",
  validateRequest(UserValidation.PatientRegisterZodValidation),
  AuthController.registerPatient,
);
router.post("/google", AuthController.googleLogin);
router.post("/login",
	validateRequest(UserValidation.PaitentLoginZodValidation),
	
	AuthController.loginUser);
router.get(
  "/me",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/forgot-password", validateRequest(UserValidation.OtpZodValidation),AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
export const AuthRoutes = router;
