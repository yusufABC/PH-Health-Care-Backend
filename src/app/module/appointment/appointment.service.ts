import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { AppointmentStatus, PaymentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { addMinutes, isAfter, isBefore, isSameDay, subHours } from "date-fns";
import PDFDocument  from "pdfkit";
import { Transporter } from "../../lib/nodemailer";
import { IBookAppointmentPayload, ICancelAppointmentPayload, IPayAppointmentPayload, IUpdateAppointmentStatusPayload } from "./appointment.intrface";
import { IQuery } from "../../interfaces/intex";
import { AppointmentWhereInput } from "../../../generated/prisma/models";

 
const bookAppointment = async (payload:IBookAppointmentPayload,user:RequestUser) => {

    const transactionResult=await prisma.$transaction(async(tx)=>{

        const patient=await tx.patient.findFirst({
            where:{
                userId:user.userId
            }
        })

        if(!patient){
            throw new AppError(httpStatus.NOT_FOUND, "Patient Not Found")
        }

        const schedule=await tx.schedule.findUnique({
            where :{
                id:payload.scheduleId
            },include:{doctor:true}
        })

        if(!schedule){
            throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found")
        }

        if(schedule.status !== "PUBLISHED"){
            throw new AppError(httpStatus.BAD_REQUEST, "Schedule Not Published")
        }

        if(schedule.availableSlots <=0){
            throw new AppError(httpStatus.BAD_REQUEST, "No Available Slots")
        }
        const now=new Date()

        if(isSameDay(now,schedule.startDateTime)){
            throw new AppError(httpStatus.BAD_REQUEST, "Cannot Book Appointment On Same Day")
        }

        if(isAfter(now,schedule.startDateTime)){
            throw new AppError(httpStatus.BAD_REQUEST, "Cannot Book Appointment On Past Date")
        }

        const existingAppointment=await tx.appointment.findFirst({
            where:{
                patientId:patient.id,
                scheduleId:schedule.id
            }
        })

		if(existingAppointment?.status === AppointmentStatus.PENDING){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Pending Appointment. Please Pay For That")
		}
		if(existingAppointment?.status === AppointmentStatus.CONFIRMED){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Confirmed Appointment.")
		}
		if(existingAppointment?.status === AppointmentStatus.ONGOING){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have A Ongoing Appointment")
		}
		if(existingAppointment?.status === AppointmentStatus.COMPLETED){
			throw new AppError(httpStatus.BAD_REQUEST, "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day")
		}
        if(existingAppointment){
            throw new AppError(httpStatus.BAD_REQUEST, "You already have an appointment for this schedule")
        }

        if(!schedule.doctor.consultationFee){
            throw new AppError(httpStatus.BAD_REQUEST, "Doctor didnt set consultation fee")
        }

        const amount=schedule.doctor.consultationFee.toString()
        

        if(existingAppointment){}

        const appointment=await tx.appointment.create({
            data:{
                status:AppointmentStatus.PENDING,
                patientId:user.userId,
                scheduleId:schedule.id,
                doctorId:schedule.doctorId,

            }
        })



const bkashIdToken=await getBkashIdToken()
    const bookAppointmentResponse=await fetch(`${config.bkash_base_url}/tokenized-checkout/payment/create`,{

        method:"POST",
     headers:{
                "Content-Type":"application/json",
              "X-App-Key"	:config.bkash_app_key,
               Authorization:bkashIdToken
               
            },
    
            body:JSON.stringify({
                mode: "0011",
                payerReference: user.email,
    callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
    payerRefrence:user.email,
    amount: amount,
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: appointment.id, // appointment id
    subMerchantName: "Test",
    merchantAssociationInfo : "MI05MID54RF09123456789"
               
            })

    })

    const result =await bookAppointmentResponse.json()

    await tx.payment.create({
        data:{
            appointmentId:appointment.id,
            bkashPaymentId:result.paymentId,
            merchantInvoiceNumber:result.merchantInvoiceNumber,
            amount:amount,
            gatewayResponse:result,
            payerReference:user.email

        }
    })

  	return {
			paymentUrl: result.bkashURL,
		};
    })
    
return transactionResult
}

// if user somehow failed to pay for an appointmet ,it will save into db so user can pay for it again same appointment that failed to pay for it before

const payAppointment=async (payload:IPayAppointmentPayload,user:RequestUser) => {
    const appointmentId=payload.appointmentId
    const existingAppoiontment=await prisma.appointment.findUnique({
        where:{
            id:appointmentId
        },include:{doctor:true}
    })

    if(!existingAppoiontment){
        throw new AppError(httpStatus.NOT_FOUND, "Appointment doesn't exist")
    }
    if(existingAppoiontment.status !== "PENDING"){
        throw new AppError(httpStatus.BAD_REQUEST, "Status is't Pending")
 
    }

    if(!existingAppoiontment.doctor.consultationFee){
        throw new AppError(httpStatus.BAD_REQUEST, "Doctor didn't set consultation fee")
    }

    const amount =existingAppoiontment.doctor.consultationFee?.toString()



    const bkashIdToken=await getBkashIdToken()
    const bookAppointmentResponse=await fetch(`${config.bkash_base_url}/tokenized-checkout/payment/create`,{

        method:"POST",
     headers:{
                "Content-Type":"application/json",
              "X-App-Key"	:config.bkash_app_key,
               Authorization:bkashIdToken
               
            },
    
            body:JSON.stringify({
                mode: "0011",
                payerReference: user.email,
    callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
    payerRefrence:user.email,
    amount: amount,
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: existingAppoiontment.id, // appointment id
    subMerchantName: "Test",
    merchantAssociationInfo : "MI05MID54RF09123456789"
               
            })

    })

    const result =await bookAppointmentResponse.json()

    await prisma.payment.update({
        where:{
           appointmentId:existingAppoiontment.id
        },
        data:{
            bkashPaymentId:result.paymentId,
            merchantInvoiceNumber:result.merchantInvoiceNumber,
            gatewayResponse:result,
         
        }
    })

 

      return  {
        paymentUrl:result.bkashURL,
      }
    

    
}



const bookAppointmentCallback = async (query : Record<string,any>) => {

  const transactionResult= await prisma.$transaction(async(tx)=>{
         const bkashIdToken=await getBkashIdToken()
   
    const paymentId= query.paymentID
    const status = query.status
if(!paymentId){
    throw new AppError(httpStatus.BAD_REQUEST, "Payment ID is required")
}


if(!status){
    throw new AppError(httpStatus.BAD_REQUEST, "Payment Status need")
}


    const executePaymentResponse= await fetch(`${config.bkash_base_url}/tokenized-checkout/payment/execute`,{
        method:"POST",
     headers:{
                "Content-Type":"application/json",
              "X-App-Key"	:config.bkash_app_key,
               Authorization:bkashIdToken
               
            },
    
            body:JSON.stringify({
              paymentId
               
            })
    })


    const executedPaymentResult= await executePaymentResponse.json()





    if(status=== "success"){
        const appointment =await tx.appointment.findUnique({
            where:{
                id:executedPaymentResult.merchantInvoiceNumber
            },
            include:{schedule:true, patient:true, doctor:true},
         
        })

        if(!appointment){  
            throw new AppError(httpStatus.NOT_FOUND, "Appointment not found")
        }

        const alreadyBookedSlot=appointment.schedule.availableSlots

        const serialNumber=alreadyBookedSlot +1

        const joiningTime=addMinutes(appointment.schedule.startDateTime, (serialNumber -1) * 20)



        await tx.appointment.update({
            where:{
                id:executedPaymentResult.merchantInvoiceNumber
            },
            data:{
                status:AppointmentStatus.CONFIRMED,
                joiningTime,
                serialNumber,
            }
        })

        const newAvailableSlots=alreadyBookedSlot -1

        await tx.schedule.update({
            where:{
                id:appointment.scheduleId
            },
            data:{
                availableSlots:newAvailableSlots
            }
        })
        

        await tx.payment.update({
            where:{
                appointmentId:executedPaymentResult.merchantInvoiceNumber,
                bkashPaymentId:paymentId,

            },
            data:{
                status:PaymentStatus.PAID,
                bkashtrxId:executedPaymentResult.trxId,
                paidAt:executedPaymentResult.paymentExecuteTime,
                gatewayResponse:executedPaymentResult,



            }
        })

           const pdfDocument=new PDFDocument({margin:50})
           const pdfChunks:Buffer[]=[]

           pdfDocument.on("data",(chunk)=>{
            pdfChunks.push(chunk)
           })

           	const pdfReadyPromise = new Promise<Buffer>((resolve)=>{
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChunks))
				})
			})

			pdfDocument.fontSize(20).text("PH Healthcare System", {align : "center"});
			pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
			pdfDocument.moveDown(2)

			pdfDocument.fontSize(12).text(`Patient Name: ${appointment.patient?.name}`);
			pdfDocument.text(`Patient Email: ${appointment.patient?.email}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Doctor Name: ${appointment.doctor?.name}`);
			pdfDocument.text(`Specialization: ${appointment.doctor?.specialization}`);
			pdfDocument.moveDown();

			pdfDocument.text(
				`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
			);
			pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
			pdfDocument.text(`Your Serial Number: ${serialNumber}`);
			pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
			pdfDocument.moveDown();

			pdfDocument.text(`Amount Paid: ${executedPaymentResult.amount} BDT`);
			pdfDocument.text(`Payment Method: bKash`);
			pdfDocument.text(`Transaction Id: ${executedPaymentResult.trxID}`);
			pdfDocument.text(`Paid At: ${executedPaymentResult.paymentExecuteTime}`);

			pdfDocument.end()

			const pdfBuffer = await pdfReadyPromise;

			await Transporter.sendMail({
				from: config.email_sender,
				to: appointment.patient.email,
				subject: "Your Appointment Invoice - PH Healthcare System",
				text: "Thank you for booking an appointment. Please find your invoice attached.",
				attachments : [
					{
						filename: "invoice.pdf",
						content : pdfBuffer
					}
				]
			})

        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=success`

        }
    }else if(status=== "failure"){

           await tx.payment.update({
            where:{
                // appointmentId:executedPaymentResult.merchantInvoiceNumber,
                bkashPaymentId:paymentId
            },
            data:{
                status:PaymentStatus.FAILED,
            
                gatewayResponse:executedPaymentResult,

            }
        })



        return {            
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=failed`

        }
    }else if(status=== "cancel"){
          await tx.payment.update({
            where:{
                // appointmentId:executedPaymentResult.merchantInvoiceNumber,
                bkashPaymentId:paymentId
            },
            data:{
                status:PaymentStatus.CANCELLED,
            
                gatewayResponse:executedPaymentResult,

            }
        })
        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=cancel`

        }
    }else{
        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`
        }
    }

    },{
          
    maxWait: 10000,
    timeout: 20000,
  
    }
)

    return transactionResult
   
}

const cancelAppointment=async(payload:ICancelAppointmentPayload,user:RequestUser)=>{
    const appointmentId=payload.appointmentId


    const transactionResult=await prisma.$transaction(async(tx)=>{

        const existingAppointment=await tx.appointment.findUnique({
            where:{
                id:appointmentId,
                patient:{
                    email:user.email
                }
                
            },
            include:{
                payment:true,
                schedule:true
            }
        })

        if(!existingAppointment){
            throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists")
        }

        if(existingAppointment.status ==="ONGOING" || existingAppointment.status==="COMPLETED"){
            throw new AppError(httpStatus.BAD_REQUEST, "Appointment Ongoing or Completed")
        }
        if(existingAppointment.status==="CANCELLED"){
             throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Cancelled")
        }

        const updateAppointment=await tx.appointment.update({
            where:{
                id:existingAppointment.id
            },
            data:{
                status:AppointmentStatus.CANCELLED
            }

        })

        await tx.schedule.update({
            where:{
                id:existingAppointment.scheduleId
            },
            data:{
                availableSlots:{increment:1}
            }
        })

        const now=new Date()

        const startDateTime=existingAppointment.schedule.startDateTime
        const refundCutoffTime=subHours(startDateTime, 1)

        const isEligibleForRefund=isBefore(now,refundCutoffTime)

        if(isEligibleForRefund){
const bkashIdToken=await getBkashIdToken()
    if(!bkashIdToken){
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Bkash Id Token Not Found")
    }
        
            const cancelAppointmentResponse=await fetch(`${config.bkash_base_url}/tokenized-checkout/refund/payment/transaction`,{

        method:"POST",
     headers:{
                "Content-Type":"application/json",
                Accept: "application/json",
                Authorization:bkashIdToken,
              "X-App-Key"	:config.bkash_app_key
               
            },
    
            body:JSON.stringify({

            	paymentId: existingAppointment.payment?.bkashPaymentId,
					trxId: existingAppointment.payment?.bkashtrxId,
					refundAmount: existingAppointment.payment?.amount,
					sku: "Appointment Cancellation",
					reason: "Patient Cancelled The Appointment",
})


            

            

    })

    const result =await cancelAppointmentResponse.json()
    console.log(result,"cancel result");
await tx.payment.update({
    where:{
        appointmentId:existingAppointment.id
    },
    data:{
       refundTrxId: result.refundTrxId,
				refundedAt: result.completedTime,
				refundAmount: result.refundAmount,
				refundReason: "Patient Cancelled The Appointment",
				status: PaymentStatus.REFUNDED,
				gatewayResponse: result,
    }
})

        }

                
    
        const newPayment=await tx.payment.findUnique({
            where:{
                appointmentId:existingAppointment.id
            }
        })

		return {
			appointment: updateAppointment,
			payment: newPayment,
		};


    })

    return transactionResult


}

// doctor only confirm => ongoing or completed
const updateAppointmentStatus=async(appointmentId:string, payload:IUpdateAppointmentStatusPayload,user:RequestUser)=>{
    const doctor=await prisma.doctor.findUnique({
        where:{
            userId:user.userId
        }
    })

    if(!doctor){
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found")
    }
    const appointentment=await prisma.appointment.findUnique({
        where:{
            id:appointmentId
        }
    })
    if(!appointentment){
        throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found")
    }

    if(appointentment.status === AppointmentStatus.COMPLETED){
        throw new AppError(httpStatus.BAD_REQUEST, "Appointment Already Completed")

    }
    if (appointentment.status === AppointmentStatus.CANCELLED){
        throw new AppError(httpStatus.BAD_REQUEST, "Appointment Already Cancelled")
    }
    if (appointentment.status === AppointmentStatus.PENDING){
        throw new AppError(httpStatus.BAD_REQUEST, "Appointment is Pending you must confirm first")
    }

    if(appointentment.status=== AppointmentStatus.CONFIRMED){

        if(payload.status==="ONGOING"){
            throw new AppError(httpStatus.BAD_REQUEST, "Appointment Not Started Yet must be ONGOING")
        }


        await prisma.appointment.update({
            where:{
                id:appointmentId
            },
            data:{
                status:AppointmentStatus.ONGOING
            }
        })

    
}

if(appointentment.status=== AppointmentStatus.ONGOING){
    if(payload.status!=="COMPLETED"){
        throw new AppError(httpStatus.BAD_REQUEST, "Appointment Not Completed Yet must be COMPLETED")
    }

    await prisma.appointment.update({
        where:{
            id:appointmentId
        },
        data:{
            status:AppointmentStatus.COMPLETED
        }
    })}

    const updatedAppointment=await prisma.appointment.findUnique({
        where:{
            id:appointmentId
        }
    })



    return updatedAppointment


}

// hello 
const getMyAppointments = async (query : IQuery, user : RequestUser) => {


	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	const andConditions: AppointmentWhereInput[] = [
		{
			patientId : patient.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

//doctor appointments
const getDoctorAppointments = async (query: IQuery, user: RequestUser) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const andConditions: AppointmentWhereInput[] = [
		{
			doctorId : doctor.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			patient: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

//admin super admin
const getAllAppointments = async (query : IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const andConditions: AppointmentWhereInput[] = [];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.doctorId) {
		andConditions.push({ doctorId: query.doctorId });
	}

	if (query.patientId) {
		andConditions.push({ patientId: query.patientId });
	}

	if(query.doctorEmail){
		andConditions.push({
			doctor : {
				email : query.doctorEmail
			}
		})
	}
	if(query.patientEmail){
		andConditions.push({
			patient : {
				email : query.patientEmail
			}
		})
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder },
		include: {
			patient: { select: { id: true, name: true, email: true } },
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

// for all loggedin user
const getSingleAppointment = async (appointmentId : string, user : RequestUser) => {
	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
		include: {
			patient: { select: { id: true, name: true, email: true, userId: true } },
			doctor: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(user.role === Role.PATIENT){
		if(appointment.patient.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}
	if(user.role === Role.DOCTOR){
		if(appointment.doctor.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}

	return appointment
}




export const AppointmentServices = {
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