import { addDays, differenceInMinutes, isAfter, isSameDay, startOfDay } from "date-fns"
import { prisma } from "../../lib/prisma"
import { RequestUser } from "../../middleware/checkAuth"
import { AppError } from "../../utils/AppError"
import { ICreateSchedulePayload, IUpdateSchedulePayload } from "./schedule.interface"
import httpStatus from "http-status"
import { IQuery } from "../../interfaces/intex"
import { ScheduleWhereInput } from "../../../generated/prisma/models"
import { IRequestUser } from "../auth/auth.interface"
import { ScheduleStatus } from "../../../generated/prisma/enums"

const createSchedule=async(payload:ICreateSchedulePayload,user:RequestUser)=>{
const {startDateTime,endDateTime,meetingLink}=payload
const {userId}=user

const doctor=await prisma.doctor.findUnique({
    where:{
        id:userId,
        isDeleted:false
    }
})

if(!doctor){
    throw new AppError(httpStatus.NOT_FOUND,"Doctor not found")
}

    // 25 August => start Time  : 9:00 PM 
    // 26 August => end Time : 3:00AM

    if(!isSameDay(payload.startDateTime, payload.endDateTime)){ 
        throw new AppError(httpStatus.CONFLICT, "Start Date Time And End Date Time Must Be On The Same Day")
    }
    if(isAfter(payload.startDateTime, payload.endDateTime)){ // 25 August =>  3:00 PM - 9:00 PM

        throw new AppError(httpStatus.CONFLICT, "Start Date Time Cannot Be After End Date Time")
    }


const startOfTheDay=startOfDay(startDateTime)
const startOfNextDay=addDays(startDateTime,1)


const existingSchedule=await prisma.schedule.findFirst({
    where:{
        doctorId:userId,
        startDateTime:{
            get:startOfTheDay,
            lt:startOfNextDay
        }
    }
})

if(existingSchedule){
    throw new AppError(httpStatus.BAD_REQUEST,"Schedule already exists for this day")
}

const durationInMinures=differenceInMinutes(endDateTime,startDateTime)

const MINUTES_ALLOCATED_PER_SLOT=20

const totalSlots=Math.floor(durationInMinures/MINUTES_ALLOCATED_PER_SLOT)



const schedule=await prisma.schedule.create({
    data:{
        doctorId:doctor.id,
        startDateTime,
        endDateTime,
        meetingLink,
        totalSlots,
        availableSlots:totalSlots,
    },
    include:{
        doctor:{
            select:{
                id:true,
                name:true,
                email:true,

            }
        }
    }
})
return schedule

}

const getMySchedules = async (query : IQuery, user : RequestUser) => {

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

    // let limit = 10;
    // if (query.limit) {
    //     limit = Number(query.limit);
    // }

    // let page = 1;
    // if (query.page) {
    //     page = Number(query.page);
    // }

    // const skip = (page - 1) * limit;

    

    const andConditions: ScheduleWhereInput[] = [
        {
            doctorId : doctor.id
        },
        {
            isDeleted : false
        }
    ];

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    const schedules = await prisma.schedule.findMany({
        where : {
            AND : andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include : {
            appointments : {
                include : {
                    patient : true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getAllSchedules = async (query : IQuery) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const andConditions: ScheduleWhereInput[] = [];

    if (query.doctorId) {
        andConditions.push({ doctorId: query.doctorId });
    }
    if (query.email) {
        andConditions.push({ doctor : {
            email : query.email
        } });
    }

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    if (query.searchTerm) {
        andConditions.push({
            doctor: {
                OR: [
                    { name: { contains: query.searchTerm, mode: "insensitive" } },
                    { email: { contains: query.searchTerm, mode: "insensitive" } },
                    {
                        specialization: { contains: query.searchTerm, mode: "insensitive" },
                    },
                ],
            },
        });
    };

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include: {
            appointments: {
                include: {
                    patient: true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getScheduleById = async (scheduleId : string) => {

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
            doctor: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    specialization: true,
                    userId: true,
                },
            },
            appointments: {
                include: {
                    patient: true
                },
            }
        },
    });

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    return schedule

}

const updateSchedule=async(scheduleId:string,payload:IUpdateSchedulePayload,user:IRequestUser,)=>{
    const userId=user.userId
let {startDateTime,endDateTime,meetingLink}=payload



     const doctor=await prisma.doctor.findUnique({ 
     where:{
        id:user.userId
     }
    })
    if(!doctor){
        throw new AppError(httpStatus.NOT_FOUND,"Doctor not found")
    }

 const schedule=await prisma.schedule.findUnique({
    where:{
        id:scheduleId,
        doctorId:doctor.id
    }
 })

 if(!schedule || schedule.isDeleted){
    throw new AppError(httpStatus.NOT_FOUND,"Schedule not found")
 }

if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots){
    throw new AppError(httpStatus.BAD_REQUEST,"Cannot update schedule with booked appointments it is already published and has booked appointments")
}


meetingLink=meetingLink ?? schedule.meetingLink
startDateTime=startDateTime ?? schedule.startDateTime
endDateTime=endDateTime ?? schedule.endDateTime


    // 25 August => start Time  : 9:00 PM 
    // 26 August => end Time : 3:00AM

    if(!isSameDay(startDateTime, endDateTime)){ 
        throw new AppError(httpStatus.CONFLICT, "Start Date Time And End Date Time Must Be On The Same Day")
    }
    if(isAfter(startDateTime,endDateTime)){ // 25 August =>  3:00 PM - 9:00 PM

        throw new AppError(httpStatus.CONFLICT, "Start Date Time Cannot Be After End Date Time")
    }

const startOfTheDay=startOfDay(startDateTime)
const startOfNextDay=addDays(startDateTime,1)

const existingSchedule=await prisma.schedule.findFirst({
    where:{
        doctorId:userId,
        startDateTime:{
            get:startOfTheDay,
            lt:startOfNextDay
        }
    }
})

if(existingSchedule){
    throw new AppError(httpStatus.BAD_REQUEST,"Schedule already exists for this day")
}

const durationInMinures=differenceInMinutes(endDateTime,startDateTime)

const MINUTES_ALLOCATED_PER_SLOT=20

const totalSlots=Math.floor(durationInMinures/MINUTES_ALLOCATED_PER_SLOT)



const updatedSchedule=await prisma.schedule.update({

    where:{
        id:scheduleId,
      
    },

    data:{
        doctorId:doctor.id,
        startDateTime,
        endDateTime,
        meetingLink,
        totalSlots,
        availableSlots:totalSlots,
    },
    include:{
        doctor:{
            select:{
                id:true,
                name:true,
                email:true,

            }
        }
    }
})
return updatedSchedule

}

const publishSchedule=async(scheduleId:string,user:IRequestUser)=>{
    const doctor=await prisma.doctor.findUnique({
        where:{
            id:user.userId
        }
    })

    if(!doctor){
        throw new AppError(httpStatus.NOT_FOUND,"Doctor not found")
    }

    const schedule=await prisma.schedule.findUnique({
        where:{
            id:scheduleId,
            doctorId:doctor?.id
        }
    })

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND,"Schedule not found")
    }

if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots){
    throw new AppError(httpStatus.BAD_REQUEST,"Cannot publish schedule it is already published and has booked appointments")
}


const publishedSchedule=await prisma.schedule.update({
    where:{
        id:schedule.id,
        doctorId:doctor.id
    },
    data:{
        status:ScheduleStatus.PUBLISHED
    }
    
})

return publishedSchedule

}
const deleteSchedule=async(scheduleId:string,user:IRequestUser)=>{
    const doctor=await prisma.doctor.findUnique({
        where:{
            id:user.userId
        }
    })

    if(!doctor){
        throw new AppError(httpStatus.NOT_FOUND,"Doctor not found")
    }

    const schedule=await prisma.schedule.findUnique({
        where:{
            id:scheduleId,
            doctorId:doctor?.id
        }
    })

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND,"Schedule not found")
    }

if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots){
    throw new AppError(httpStatus.BAD_REQUEST,"Cannot delete schedule it is already published and has booked appointments")
}


const publishedSchedule=await prisma.schedule.update({
    where:{
        id:schedule.id,
        doctorId:doctor.id
},
data:{
   isDeleted:true,
   deletedAt:new Date() 
}
     
    
})

return publishedSchedule



}


const getTodaysSchedules = async (query : IQuery) => {
    if(!query.doctorId){
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Id Must Be Provided In Query")
    }

    const doctor = await prisma.doctor.findUnique({
        where: { id : query.doctorId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfTomorrow = addDays(startOfToday, 1)

    const andConditions: ScheduleWhereInput[] = [
        {
            doctorId : query.doctorId
        },
        {
            isDeleted : false
        },
        {
            status : ScheduleStatus.PUBLISHED
        },
        {
            startDateTime : {
                gte : startOfToday,
                lt : startOfTomorrow,
                gt: now
            }
        },
        {
            availableSlots : { gt : 0}
        }
    ];

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
    


export const ScheduleService = {
    createSchedule,
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    publishSchedule,
    getTodaysSchedules,
    deleteSchedule
}