import httpStatus from "http-status";
import { AppError } from "../utils/AppError";
import config from "../config"
import { redisClient } from "./redis"

export const getBkashIdToken=async()=>{

try {
    const idTokenKey="bkash:idToken"
const refreshTokenKey="bkash:refreshToken"

let bkashIdToken=await redisClient.get(idTokenKey)
let refreshToken=await redisClient.get(refreshTokenKey)

const bkashIdTokenTTL=await redisClient.ttl(idTokenKey)
const refreshTokenTTL=await redisClient.ttl(refreshTokenKey)

// if id token expiration time is 10 min Fetch Refresh token and store id token into variable and set into redis 
if((bkashIdTokenTTL <= 600 || !bkashIdToken) && refreshToken && refreshTokenTTL > 600){
      const refreshTokenResponse=await fetch(`${config.bkash_base_url}/tokenized-checkout/auth/refresh-token`,{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            Accept	:"application/json",
            username:config.bkash_username,
            password:config.bkash_password
        },

        body:JSON.stringify({
            app_key:config.bkash_app_key,
            app_secret:config.bkash_app_secret,
            refresh_token:refreshToken
        })
    })


    const result =await refreshTokenResponse.json()
         bkashIdToken=result.id_token as string 

        await redisClient.set(idTokenKey,bkashIdToken,{
        expiration:{
            type:"EX",
            value:60*60
        }
    })
return result 
}



if(bkashIdTokenTTL >600){
    return bkashIdToken
}


    


    const response=await fetch(`${config.bkash_base_url}/tokenized-checkout/auth/grant-token`,{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            Accept	:"application/json",
            username:config.bkash_username,
            password:config.bkash_password
        },

        body:JSON.stringify({
            app_key:config.bkash_app_key,
            app_secret:config.bkash_app_secret
        })
    })

    if(!response.ok){
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Bkash Access token grant failed")
    }

    const result=await response.json() 

    // bkash Id token set 

    await redisClient.set(idTokenKey,result.id_token,{
        expiration:{
            type:"EX",
            value:60*60
        }
    })

    // bkash refresh token set 

    await redisClient.set(refreshTokenKey,result.refresh_token,{
         expiration:{
            type:"EX",
            value:60*60*24*28
        }
    })

    bkashIdToken=result.id_token 
    

    return bkashIdToken
    
} catch (error) {
    throw error
}
}