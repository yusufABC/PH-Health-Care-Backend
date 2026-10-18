import { v2 as cloudinary } from 'cloudinary';
// Configure Cloudinary (use your own cloud_name, api_key, and api_secret)
cloudinary.config({
  cloud_name: 'your_cloud_name',
  api_key: 'your_api_key',
  api_secret: 'your_api_secret'
});


export default cloudinary;
