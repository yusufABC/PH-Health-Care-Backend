import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import { DoctorVerificationStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import cloudinary from "../../lib/cloudinary";
import crypto from "crypto"
import { redisClient } from "../../lib/redis";
import path from "path";
import { Transporter } from "../../lib/nodemailer";
import ejs from "ejs"
import { IApplyAsDoctorPayload, IVerifyDoctorEmailPayload, IVerifyDoctorPayload } from "./doctor.interface";
import { RequestUser } from "../../middleware/checkAuth";
import { IQuery } from "../../interfaces/intex";
import { DoctorWhereInput } from "../../../generated/prisma/models";


const applyAsDoctor = async (
	payload: IApplyAsDoctorPayload,
	resume: Express.Multer.File | null,
	additionalFiles: Express.Multer.File[],
) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			email: payload.user.email,
		},
	});

	if (isUserExists) {
		throw new AppError(httpStatus.CONFLICT, "User Already Exists With This Email");
	}

	const resumeUploadResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{
						resource_type: "auto",
					},

					async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(new AppError(httpStatus.INTERNAL_SERVER_ERROR, "No result returned from Cloudinary"));
						}

						resolve(result);
					},
				)
				.end(resume?.buffer);
		},
	);

	console.log({ resumeUploadResult });

	const additionalFilesUploadResults = await Promise.all(
		additionalFiles.map((file) => {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				cloudinary.uploader
					.upload_stream(
						{
							resource_type: "auto",
						},

						async (error, result) => {
							if (error) {
								return reject(error);
							}

							if (!result) {
								return reject(new AppError(httpStatus.INTERNAL_SERVER_ERROR, "No result returned from Cloudinary"));
							}

							resolve(result);
						},
					)
					.end(file.buffer);
			});
		}),
	);

	console.log({ additionalFilesUploadResults });

	const randomDoctorPassword = Math.random().toString(36).slice(-8);

	const hashedPassword = await bcrypt.hash(
		randomDoctorPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const doctorApplication = await prisma.user.create({
		data: {
			...payload.user,
			password: hashedPassword,
			role: Role.DOCTOR,
			needPasswordChange: true,
			doctor: {
				create: {
					name: payload.user.name,
					email: payload.user.email,
					...payload.doctor,
					resume: resumeUploadResult.secure_url,
					resumePublicId: resumeUploadResult.public_id,
                    yearsOfExperience: payload.doctor.experienceYears,
					additionalFiles: additionalFilesUploadResults.map((file) => ({
						url: file.secure_url,
						publicId: file.public_id,
					})),
				},
			},
		},

		include: {
			doctor: true,
		},
	});

    // Send doctor otp so that this new doctor can verify his email

    const expiresInSecond= 60 * 60
    const otp =crypto.randomInt(10000,100000).toString()
    const key=`Doctor-Email-Verify-OTP:${payload.user.email}`

    await redisClient.set(key,otp,{
        expiration:{
            type:"EX",
            value:expiresInSecond
        }
    })

    
      const templatePath=path.join(process.cwd(),"src/app/templates/verify-register-user.ejs")
    const renderFileData={
      name,
      email:payload.user.email,
      otp,
      expiresInMinutes:expiresInSecond/60
    }
    
     const html=await ejs.renderFile(templatePath,renderFileData)
    
    await Transporter.sendMail({
      from:config.email_sender,
      to:payload.user.email,
      subject:"Verify your email",
      html
    })

	return doctorApplication;
};

const vefiryDoctorEmail=async(payload:IVerifyDoctorEmailPayload)=>{
    const key=`Doctor-Email-Verify-OTP:${payload.email}`
    const otpFromUser=payload.otp
    const otpFromRedis=await redisClient.get(key)

if(!otpFromRedis){
    throw new AppError(httpStatus.BAD_REQUEST, "OTP Expired")
}
if(otpFromUser!==otpFromRedis){
throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP Please Check Your Email For Correct OTP")
}

await redisClient.del(key)

const updateDoctor=await prisma.user.update({
    where :{
        email:payload.email
    },
    data:{
        emailVerified:true
    },
    omit:{
        password:true
    },
    include:{
        doctor:true
    }
})
return updateDoctor

}

const approveDoctor=async(payload:IVerifyDoctorPayload,reviewer:RequestUser)=>{
	const {doctorId,verificationStatus,rejectionReason}=payload

	const existingDoctor=await prisma.doctor.findUnique({
	where :{
		id:doctorId
	},include:{user:true}
	})

	if(!existingDoctor){
		throw new AppError(httpStatus.NOT_FOUND, "Doctor application Not Found")
	}

	if(existingDoctor.isDeleted){
		throw new AppError(httpStatus.FORBIDDEN, "Doctor application is Deleted")
	}
	if(existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new AppError(httpStatus.BAD_REQUEST, ` Doctor verification already been ${existingDoctor.verificationStatus.toLowerCase ()}`)

	}
	if(!existingDoctor.user.emailVerified){
		throw new AppError(httpStatus.FORBIDDEN, "Doctor email is not verified yet")
	}       

	if(verificationStatus===DoctorVerificationStatus.REJECTED && !rejectionReason){
		throw new AppError(httpStatus.BAD_REQUEST, "Rejection reason is required when rejecting a doctor application")
	}

	// update the doctor
	const updatedDoctor=await prisma.doctor.update({
		where:{
			id:doctorId,
		},
		data:{
			verificationStatus,
			rejectionReason:
			verificationStatus===DoctorVerificationStatus.REJECTED ? rejectionReason:null,
			reviewedBy:reviewer.userId,
			reviewdAt:new Date()
		}
	})

	const isApproved=verificationStatus===DoctorVerificationStatus.APPROVED

	const templatePath=path.join(process.cwd(),`${isApproved ? "src/app/templates/doctor-approved.ejs" : "src/app/templates/doctor-rejected.ejs"}`)

	
	const templateData = {
		name: updatedDoctor.name,
		reason: updatedDoctor.rejectionReason,
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await Transporter.sendMail({
		from: config.email_sender,
		to: updatedDoctor.email,
		subject: isApproved
			? "Your Doctor Application Has Been Approved"
			: "Your Doctor Application Has Been Rejected",
		html,
	});   

return updatedDoctor
}


const getAllDoctors=async(query: IQuery)=>{

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const andConditions: DoctorWhereInput[] = []

	//Searching
	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ email: { contains: query.searchTerm, mode: "insensitive" } },
				{
					specialization: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					licenseNumber: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	//filtering
	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	if (query.email) {
		andConditions.push({
			email: { contains: query.email, mode: "insensitive" },
		});
	}

	if (query.licenseNumber) {
		andConditions.push({
			licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
		});
	}

	if (query.verificationStatus) {
		andConditions.push({
			verificationStatus: query.verificationStatus as DoctorVerificationStatus,
		});
	}

	andConditions.push({ isDeleted: false });

	const allDoctors = await prisma.doctor.findMany({
		where : {
			AND : andConditions.length > 0 ? andConditions : undefined
		},

		take: limit,
		skip: skip,


		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder
		},

		include:{
			user: {
				omit:{
					password: true
				}
			},

			// schedules: true,
			// appointments: true
			// prescriptions: true
		}

	});

	const totalDoctorCount = await prisma.doctor.count({
		where: {
			AND: andConditions
		}
	})

	return {
		data: allDoctors,
		meta: {
			page: page,
			limit: limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit)
		}
	}


}






export const DoctorServices = {
	applyAsDoctor,
    vefiryDoctorEmail,
	approveDoctor,
	getAllDoctors
};