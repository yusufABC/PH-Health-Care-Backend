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

    export const UserValidation={
        PatientRegisterZodValidation,
		PaitentLoginZodValidation
    }