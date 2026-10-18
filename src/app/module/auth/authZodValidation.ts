import z from "zod";

	const PatientRegisterZodValidation=z.object({
		name: z.string().min(3).max(10),
		email:z.email(),
		password:z.string()
		 .min(8,  "Password must be at least 8 characters long." )
		  .max(32, "Password cannot exceed 32 characters." )
 		 .regex(/[A-Z]/,  "Password must contain at least one uppercase letter." )
  		.regex(/[a-z]/,  "Password must contain at least one lowercase letter." )
  		.regex(/[0-9]/, "Password must contain at least one number." )
 		 .regex(/[^A-Za-z0-9]/,  "Password must contain at least one special character." ),
		patient:z.object({
			contactNumber:z.string().optional(),
			
		}).optional()

	})

	const PaitentLoginZodValidation=z.object({
		email:z.email(),
		password:z.string()
		 .min(8,  "Password must be at least 8 characters long." )
		  .max(32, "Password cannot exceed 32 characters." )
 		 .regex(/[A-Z]/,  "Password must contain at least one uppercase letter." )
  		.regex(/[a-z]/,  "Password must contain at least one lowercase letter." )
  		.regex(/[0-9]/, "Password must contain at least one number." )
 		 .regex(/[^A-Za-z0-9]/,  "Password must contain at least one special character." ),

	})

	const PaitentEmailVerifyZodValidation=z.object({
		email:z.email(),
		otp: z.string().length(6),
	})

	const ForgotPasswordZodSchema=z.object({
		email:z
		.email({ message: "Please enter a valid email address" })
   	 .min(1, { message: "Email is required" })
    .transform((val) => val.toLowerCase().trim())
	})


const ResetPasswordZodSchema = z.object({
	email: z.email(),
	newPassword: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
	otp: z.string().length(6),
});

    export const UserValidation={
        PatientRegisterZodValidation,
		PaitentLoginZodValidation,
		ForgotPasswordZodSchema,
		ResetPasswordZodSchema,
		PaitentEmailVerifyZodValidation
    }