import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "eu-central-1" });

export async function saveAttachment(key: string, body: Uint8Array) {
  await s3.send(new PutObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: key, Body: body }));
}
