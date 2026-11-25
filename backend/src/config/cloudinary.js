import { v2 as cloudinary } from 'cloudinary'
import config from './env.js'

/**
 * The Cloudinary client.
 *
 * Configured once, and only when real credentials exist. The SDK throws on
 * upload if the keys are wrong, but it does not throw at *config* time — so the
 * guard that matters is `isConfigured()` below, which the upload routes consult
 * before doing any work. That is what lets the whole API run against the
 * placeholder credentials in `.env`.
 */

if (config.cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  })
}

/** True when real credentials are present (i.e. not the `.env.example` values). */
export const isConfigured = () => config.cloudinaryConfigured

/** The folders this app writes to, all under `CLOUDINARY_FOLDER`. */
export const FOLDERS = {
  products: `${config.cloudinary.folder}/products`,
  reviews: `${config.cloudinary.folder}/reviews`,
  content: `${config.cloudinary.folder}/content`,
  brand: `${config.cloudinary.folder}/brands`,
}

export { cloudinary }
export default cloudinary
