import { v2 as cloudinary } from 'cloudinary';
import config from '../config';
// Configure Cloudinary (use your own cloud_name, api_key, and api_secret)
cloudinary.config({
  cloud_name: config.cloudinary_cloud_name,
  api_key: config.cloudinary_api_key,
  api_secret: config.cloudinary_api_secret
});


export default cloudinary;
