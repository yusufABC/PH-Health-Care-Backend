import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import { SuperAdminSeed, TesterAdminSeed, TesterDoctorSeed } from "./app/utils/seed";

const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		await SuperAdminSeed()
		await TesterAdminSeed()
		await TesterDoctorSeed()
		console.log("Connected to the database successfully.");
		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
