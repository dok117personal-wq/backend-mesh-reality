import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? '';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? '3dgeneration';
const publicBaseUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/$/, '');

const endpoint =
  accountId && accessKeyId && secretAccessKey
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined;

const s3 =
  endpoint &&
  accessKeyId &&
  secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      })
    : null;

export function isR2Configured(): boolean {
  return Boolean(s3 && bucketName && (publicBaseUrl || bucketName));
}

/**
 * Upload a buffer to R2 under prefix (e.g. "inputs/{uploadId}/{index}.jpg").
 * Returns the public URL for the object.
 */
export async function uploadToR2(params: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<string> {
  if (!s3) {
    throw new Error('R2 is not configured. Set CLOUDFLARE_R2_* env vars.');
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType ?? 'image/jpeg',
    })
  );
  const base = publicBaseUrl || `https://${bucketName}.r2.dev`;
  return `${base}/${params.key}`;
}

/**
 * Upload multiple image buffers to R2 under inputs/{uploadId}/ and return their public URLs.
 */
export async function uploadImagesToR2(images: Buffer[], contentType = 'image/jpeg'): Promise<string[]> {
  const uploadId = randomUUID();
  const urls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const key = `inputs/${uploadId}/${i}.jpg`;
    const url = await uploadToR2({ key, body: images[i], contentType });
    urls.push(url);
  }
  return urls;
}

export const r2Service = {
  isR2Configured,
  uploadToR2,
  uploadImagesToR2,
};
