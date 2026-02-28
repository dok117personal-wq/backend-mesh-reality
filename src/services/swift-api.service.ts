import { env } from '../config/env.js';
import FormData from 'form-data';
import { fetch as undiciFetch, Agent } from 'undici';

const SWIFT_URL = env.swiftApiUrl.replace(/\/$/, '');

/** Long timeout for Swift job submit (large multipart upload + server processing). */
const SWIFT_FETCH_AGENT = new Agent({
  headersTimeout: 15 * 60 * 1000, // 15 min to receive response headers
  bodyTimeout: 15 * 60 * 1000,   // 15 min for body transfer
});

export type SwiftJob = {
  id?: string;
  status: string;
  progress?: number | null;
  outputUrl?: string | null;
  output_url?: string | null;
  errorMessage?: string | null;
  error_message?: string | null;
  outputUrls?: Record<string, string> | null;
  output_urls?: Record<string, string> | null;
  modelId?: string | null;
  model_id?: string | null;
};

/**
 * Submit a multi-image job to the Swift Photogrammetry API.
 * Expects imageDataArray: base64-encoded image strings.
 * Returns the Swift job id so we can poll status.
 */
export async function submitSwiftJob(params: {
  title: string;
  description?: string;
  userId: string;
  imageDataArray: string[];
}): Promise<{ jobId: string }> {
  const { title, description, userId, imageDataArray } = params;
  if (!imageDataArray?.length) {
    throw new Error('At least one image is required for photogrammetry');
  }

  const form = new FormData();
  form.append('title', title);
  form.append('userId', userId);
  form.append('imageCount', String(imageDataArray.length));
  if (description) form.append('description', description);

  for (let i = 0; i < imageDataArray.length; i++) {
    let base64 = imageDataArray[i];
    if (typeof base64 !== 'string') continue;
    const comma = base64.indexOf(',');
    if (comma !== -1) base64 = base64.slice(comma + 1);
    const buf = Buffer.from(base64, 'base64');
    if (buf.length === 0) throw new Error(`Invalid image data at index ${i}`);
    form.append(`image_${i}`, buf, { filename: `image${i}.jpg`, contentType: 'image/jpeg' });
  }

  const headers = form.getHeaders();
  console.log('[swift] Building multipart body for %s images...', imageDataArray.length);
  const body = form.getBuffer();
  console.log('[swift] POST %s/jobs (bodySize=%s bytes)', SWIFT_URL, body.length);

  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(`${SWIFT_URL}/jobs`, {
      method: 'POST',
      body,
      headers: headers as Record<string, string>,
      dispatcher: SWIFT_FETCH_AGENT,
    });
  } catch (err) {
    const cause = err instanceof Error ? err.cause ?? err.message : String(err);
    console.error('[swift] Request failed (is Swift running on %s?):', SWIFT_URL, cause);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Swift API error ${res.status}: ${text}`);
  }

  const job = (await res.json()) as { id?: string };
  const jobId = job?.id;
  if (!jobId) {
    throw new Error('Swift API did not return a job id');
  }
  return { jobId };
}

/**
 * Get job status from the Swift Photogrammetry API.
 */
export async function getSwiftJobStatus(swiftJobId: string): Promise<SwiftJob> {
  const res = await fetch(`${SWIFT_URL}/jobs/${encodeURIComponent(swiftJobId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Job not found');
    }
    const text = await res.text();
    throw new Error(`Swift API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  // Normalize model_id/modelId for backend consumption
  const modelId = json.model_id ?? json.modelId;
  return { ...json, model_id: modelId, modelId } as SwiftJob;
}
