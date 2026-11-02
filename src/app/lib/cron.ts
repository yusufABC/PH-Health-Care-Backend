import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

export const deleteUnverifiedDoctors = async () => {

    	cron.schedule("*/5 * * * * *", async () => {
			console.log("Running cron every minute ");
		})
        try {
            const oneHourAgo=new Date(Date.now()-60*60*1000)
            const deletedDoctors=await prisma.user.deleteMany({
                where:{
                    role:Role.DOCTOR,
                    emailVerified:false,
                    createdAt:{lt:oneHourAgo},
                    doctor:{
                        verificationStatus:DoctorVerificationStatus.PENDING
                    }
                }
            })

            if(deletedDoctors.count>0){
                console.log(`Cron: Deleted ${deletedDoctors.count} unverified email doctor applicatio older thatn 1 hour `);
            }
            
        } catch (error) {
            console.log("Failed to delete unverified doctor cron",error)
        }

        console.log("Doctore Deleted Cron schedule (every 10 minute)");
          
}