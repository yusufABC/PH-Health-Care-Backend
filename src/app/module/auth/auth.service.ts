import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
  IForgotPasswordPaylod,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IResetPasswordPayload,
  IVerifyPaitentPayload,
} from "./auth.interface";
import { OAuth2Client } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { Transporter } from "../../lib/nodemailer";
import path from "path";
import ejs from "ejs"
import { AppError } from "../../utils/AppError";
import httpStatus from 'http-status'

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientData } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new AppError(httpStatus.CONFLICT, "User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);



  const expiresInSeconds=5*60
  const otp=crypto.randomInt(100000, 1000000).toString();
 const key=`Verify-Registration-OTP:${email}`
await redisClient.set(key,otp,{
   expiration:{
      type:'EX',
      value:expiresInSeconds
    },
  })

  

  const templatePath=path.join(process.cwd(),"src/app/templates/verify-register-user.ejs")
const renderFileData={
  name,
  email,
  otp,
  expiresInMinutes:expiresInSeconds/60
}

 const html=await ejs.renderFile(templatePath,renderFileData)

await Transporter.sendMail({
  from:config.email_sender,
  to:email,
  subject:"Verify your email",
  html
})

  const patientRegistrationKey=`Patient-Registration-Data:${email}`
  const redisUserDataPayload={
    name,
    email,
    password:hashedPassword,
    patient:patientData
  }

  await redisClient.set(patientRegistrationKey,JSON.stringify(redisUserDataPayload),{
    expiration:{
       type:'EX',
       value:expiresInSeconds
    }
  })

  



/**
 * 

 * 
 */


};

const verifyPaitentEmail=async(payload:IVerifyPaitentPayload)=>{
   const email = payload.email.trim().toLowerCase();
   const {otp}=payload

  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

 

  if (isUserExist?.emailVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, "This Email is verified");
  }
   if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist?.status === "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked !.Please contact with admin");
  }
  

  const key=`Verify-Registration-OTP:${email}`
  const redisOtp=await redisClient.get(key)
  

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please send otp again");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Otp doesn't match");
  }

  await redisClient.del(key)

  const patientRegistrationKey=`Patient-Registration-Data:${email}`
  const redisPatientData=await redisClient.get(patientRegistrationKey)
  if(!redisPatientData){
    throw new AppError(httpStatus.NOT_FOUND, "Patient doesn't exist please try again!")
  }
  const patientPayload:IRegisterPatientPayload=JSON.parse(redisPatientData)

const createdUser = await prisma.user.create({
  data: {
    name:patientPayload.name,
    email:patientPayload.email,
    password: patientPayload.password,
    role: Role.PATIENT,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    patient: {
      create: {
         name:patientPayload.name,
    email:patientPayload.email,
        contactNumber: patientPayload?.patient?.contactNumber || "",
      },
    },
  },
  omit: { password: true },
  include: { patient: true },
});

await redisClient.del(patientRegistrationKey)

 const templatePath=path.join(process.cwd(),"src/app/templates/welcome-email.ejs")
 const renderData={
  name:createdUser.name
 }
const html=await ejs.renderFile(templatePath,renderData)

await Transporter.sendMail({
  from:config.email_sender,
  to:createdUser.email,
  subject:"Welcome to our platform",
  html
})


const { patient, ...user } = createdUser;
const jwtPayload = {
  userId: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
};

const accessToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_access_secret,
  config.jwt_access_expires_in as SignOptions,
);

const refreshToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_refresh_secret,
  config.jwt_refresh_expires_in as SignOptions,
);

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };


}

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
   throw new AppError(httpStatus.NOT_FOUND,"User not found")
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User already exists with Google authentication. Please login using Google.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new AppError(httpStatus.UNAUTHORIZED, "User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  // const result=await googleClient.verifyIdToken({idToken:payload.googleId})
  // const googleInfo=result.getPayload()
  // googleInfo.

  let googleIdTokenPayload = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });
    googleIdTokenPayload = ticket.getPayload();
  } catch (error: any) {
    console.error("Google token verification failed:", error.message);
    throw new AppError(httpStatus.UNAUTHORIZED, `Invalid Google ID token: ${error.message}`);
  }
  if (!googleIdTokenPayload) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired google id token");
  }
  if (!googleIdTokenPayload.name) {
    throw new AppError(httpStatus.BAD_REQUEST, "Name not found!");
  }
  if (!googleIdTokenPayload.email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email not found!");
  }

  const ifPaitentExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = ifPaitentExistWithGoogleAuth;

  if (!ifPaitentExistWithGoogleAuth) {
    const ifPaitentExistWithEmail = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
      },
    });

    if (ifPaitentExistWithEmail) {
      if (!ifPaitentExistWithEmail.emailVerified) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Email is not verified. Please verify your email first.",
        );
      }
      if (ifPaitentExistWithEmail?.status === UserStatus.BLOCKED) {
        throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
      }

      if (
        ifPaitentExistWithEmail?.status === UserStatus.DELETED ||
        ifPaitentExistWithEmail?.isDeleted
      ) {
        throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
      }

      user = await prisma.user.update({
        where: {
          id: ifPaitentExistWithEmail?.id,
        },
        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          emailVerified: true,
          authProvider: AuthProvider.GOOGLE,
          patient: {
            create: {
              name: googleIdTokenPayload.name,
              email: googleIdTokenPayload.email,
            },
          },
        },
      });


      const templatePath=path.join(process.cwd(),"src/app/templates/welcome-email.ejs")
 const renderData={
  name:user.name
 }
const html=await ejs.renderFile(templatePath,renderData)

await Transporter.sendMail({
  from:config.email_sender,
  to:user.email,
  subject:"Welcome to our platform",
  html
})

    }
  }

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found or created");
  }

  if (user?.status === UserStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
  }

  if (user?.status === UserStatus.DELETED || user?.isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );
  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPasswordPaylod) => {
  const { email } = payload;
  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exist");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User has associate with google so please login with google",
    );
  }
  if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist.status === "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked !.Please contact with admin");
  }
  if(!isUserExist.emailVerified){
    throw new AppError(httpStatus.FORBIDDEN, "User email isn't verified");

  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forget-password-otp:${isUserExist.email}`;
  const expiresInSecond= 5 * 60

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value:expiresInSecond
    },
  });

  const templatePath=path.join(process.cwd(),"src/app/templates/forgot-password.ejs")

  const renderData={
    name:isUserExist.name,
    otp,
    expiresInMinutes:expiresInSecond/60

  }
  const html=await ejs.renderFile(templatePath,renderData)

  await Transporter.sendMail({
    from:config.email_sender,
    to:isUserExist.email,
    subject:"Forgot Password",
    html
  })



};
const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, newPassword, otp } = payload;
  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exist");
  }

  if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User has associate with google so please login with google",
    );
  }
  if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
    throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
  }
  if (isUserExist.status === "BLOCKED") {
    throw new AppError(httpStatus.FORBIDDEN, "This user is blocked !.Please contact with admin");
  }
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const key = `forget-password-otp:${isUserExist.email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please send otp again");
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Otp doesn't match");
  }

  await prisma.user.update({
    where: {
      email,
    },
    data: {
      password: hashedPassword,
    },
  });

  await redisClient.del([key]);

// Connect Path and email and feed it to nodemailer function 
  const templatePath= path.join(process.cwd(),"src/app/templates/reset-password-confirmation.ejs")

  const renderData={
    name:isUserExist.name
  }
  const html=await ejs.renderFile(templatePath,renderData)

  // Send Mail using nodemailer

  await Transporter.sendMail({
    from:config.email_sender,
    to:isUserExist.email,
    subject:"Your Password Reset",
    html
  })
};



export const AuthService = {
  registerPatient,
  verifyPaitentEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
