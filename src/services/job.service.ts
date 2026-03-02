import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../errors/AppError.js';
import { submitSwiftJob, submitSwiftJobFromUrls } from './swift-api.service.js';
import { isR2Configured, uploadImagesToR2 } from './r2.service.js';

const GENERATION_TYPES = ['text', 'image', 'images'] as const;
const JOB_CONFIG: Record<string, { jobType: string; apiHandler: string }> = {
  text: { jobType: 'Text2Model', apiHandler: 'Hunyuan3D' },
  image: { jobType: 'Image2Model', apiHandler: 'SwiftAPI' },
  images: { jobType: 'Images2Model', apiHandler: 'SwiftAPI' },
};

export const jobService = {
  async createGenerationJob(
    userId: string,
    data: {
      generationType: string;
      textPrompt?: string;
      imageData?: unknown;
      imageDataArray?: string[];
      imageUrls?: string[];
      title?: string;
      description?: string;
      options?: Record<string, unknown>;
    }
  ) {
    if (!GENERATION_TYPES.includes(data.generationType as (typeof GENERATION_TYPES)[number])) {
      throw Errors.badRequest('Invalid generation type');
    }
    if (data.generationType === 'text' && !data.textPrompt) {
      throw Errors.badRequest('Text prompt is required for text-to-model generation');
    }
    if (data.generationType === 'image' && !data.imageData) {
      throw Errors.badRequest('Image data is required for image-to-model generation');
    }
    const hasImageUrls = data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0;
    const hasImageData = data.imageDataArray && data.imageDataArray.length > 0;
    if (data.generationType === 'images' && !hasImageUrls && !hasImageData) {
      throw Errors.badRequest('At least one image is required for photogrammetry (images). Use imageUrls or imageDataArray.');
    }
    if (data.generationType === 'images' && hasImageUrls && data.imageUrls!.length < 3) {
      throw Errors.badRequest('Photogrammetry requires at least 3 photos from different angles (20+ recommended).');
    }
    if (data.generationType === 'images' && hasImageData && data.imageDataArray!.length < 3) {
      throw Errors.badRequest('Photogrammetry requires at least 3 photos from different angles (20+ recommended).');
    }

    const config = JOB_CONFIG[data.generationType] ?? JOB_CONFIG.image;
    const jobId = `job_${randomUUID()}`;

    const inputData: Record<string, unknown> = {
      textPrompt: data.textPrompt,
      imageData: !!data.imageData,
      title: data.title ?? 'AI Generated Model',
      description: data.description ?? (data.generationType === 'text' ? data.textPrompt : 'Generated from image'),
      options: data.options,
    };

    if (config.apiHandler === 'SwiftAPI') {
      const imageUrls = data.imageUrls && Array.isArray(data.imageUrls) ? data.imageUrls : [];
      const imageDataArray =
        data.imageDataArray?.length
          ? data.imageDataArray
          : typeof data.imageData === 'string'
            ? [data.imageData]
            : [];
      if (imageUrls.length === 0 && imageDataArray.length === 0) {
        throw Errors.badRequest('At least one image is required for image/images generation (imageUrls or imageDataArray)');
      }
      try {
        let urlsToUse = imageUrls;
        if (urlsToUse.length === 0 && imageDataArray.length > 0 && isR2Configured()) {
          console.log('[job] Uploading %s images to R2, then calling Swift with URLs...', imageDataArray.length);
          const buffers = imageDataArray.map((base64) => {
            const comma = base64.indexOf(',');
            const b64 = comma >= 0 ? base64.slice(comma + 1) : base64;
            return Buffer.from(b64, 'base64');
          });
          urlsToUse = await uploadImagesToR2(buffers);
          console.log('[job] R2 upload done, %s URLs', urlsToUse.length);
        }
        if (urlsToUse.length > 0) {
          console.log('[job] Calling Swift API with %s image URLs (R2)...', urlsToUse.length);
          const { jobId: swiftJobId } = await submitSwiftJobFromUrls({
            title: inputData.title as string,
            description: inputData.description as string,
            userId,
            imageUrls: urlsToUse,
          });
          console.log('[job] Swift job created swiftJobId=%s', swiftJobId);
          inputData.swiftJobId = swiftJobId;
        } else {
          console.log('[job] Calling Swift API with %s images (multipart)...', imageDataArray.length);
          const { jobId: swiftJobId } = await submitSwiftJob({
            title: inputData.title as string,
            description: inputData.description as string,
            userId,
            imageDataArray,
          });
          console.log('[job] Swift job created swiftJobId=%s', swiftJobId);
          inputData.swiftJobId = swiftJobId;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error && err.cause ? String(err.cause) : '';
        console.error('Swift API submit failed:', msg, cause || '');
        throw Errors.badRequest(err instanceof Error ? err.message : 'Failed to submit to photogrammetry service');
      }
    }

    const job = await prisma.job.create({
      data: {
        id: jobId,
        status: 'pending',
        jobType: config.jobType,
        apiHandler: config.apiHandler,
        priority: (data.options?.priority as number) ?? 5,
        model_id: null,
        user_id: userId,
        inputData,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return { jobId: job.id, status: job.status };
  },

  async getJobStatus(jobId: string, userId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Model: { select: { user_id: true, preview_url: true, output_urls: true } },
      },
    });

    if (!job) throw Errors.notFound('Job not found');
    if (job.Model && job.Model.user_id !== userId) throw Errors.forbidden('Access denied');
    if (!job.Model && job.user_id !== userId) throw Errors.forbidden('Access denied');

    const inputData = (job.inputData as Record<string, unknown> | null) ?? {};
    if (job.apiHandler === 'SwiftAPI' && typeof inputData.swiftJobId === 'string') {
      const { getSwiftJobStatus } = await import('./swift-api.service.js');
      try {
        const swift = await getSwiftJobStatus(inputData.swiftJobId as string);
        const outputUrl = swift.outputUrl ?? swift.output_url ?? null;
        const outputUrls = swift.outputUrls ?? swift.output_urls ?? null;
        const progress = typeof swift.progress === 'number'
          ? swift.progress
          : swift.status === 'completed'
            ? 100
            : swift.status === 'failed'
              ? 0
              : 0;
        const usdzUrl = outputUrl ?? (outputUrls && typeof (outputUrls as Record<string, string>).usdz === 'string' ? (outputUrls as Record<string, string>).usdz : null);
        const previewUrl = (outputUrls && ((outputUrls as Record<string, string>).gif ?? (outputUrls as Record<string, string>).preview)) ?? null;
        const modelId = swift.modelId ?? swift.model_id ?? job.model_id;

        // Sync Swift completion to backend: create Model first (FK), then update Job
        if (swift.status === 'completed' || swift.status === 'failed') {
          // Create Model BEFORE updating Job (Job.model_id FK references Models)
          if (swift.status === 'completed' && modelId && usdzUrl) {
            const title = (inputData.title as string) ?? 'Generated Model';
            const description = (inputData.description as string) ?? null;
            const outputUrlsJson = outputUrls ? (outputUrls as Record<string, string>) : { usdz: usdzUrl, ...(previewUrl && { gif: previewUrl }) };
            await prisma.model.upsert({
              where: { id: modelId },
              create: {
                id: modelId,
                title,
                description,
                status: 'completed',
                output_formats: ['usdz'],
                output_urls: outputUrlsJson,
                preview_url: previewUrl ?? null,
                user_id: job.user_id,
                filePath: `/models/${modelId}`,
                fileType: 'usdz',
                isPublic: false,
                created_at: new Date(),
                updated_at: new Date(),
              },
              update: {
                status: 'completed',
                output_urls: outputUrlsJson,
                preview_url: previewUrl ?? null,
                updated_at: new Date(),
              },
            });
          }

          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: swift.status,
              // Only set model_id when Model exists (completed + we just upserted it)
              ...(swift.status === 'completed' && modelId && { model_id: modelId }),
              error_message: swift.errorMessage ?? swift.error_message ?? job.error_message ?? undefined,
              updated_at: new Date(),
            },
          });
        }

        return {
          id: job.id,
          status: swift.status,
          progress,
          errorMessage: swift.errorMessage ?? swift.error_message ?? job.error_message,
          modelId: modelId ?? job.model_id,
          outputUrl: usdzUrl,
          previewUrl,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };
      } catch (err) {
        if (err instanceof Error && err.message === 'Job not found') {
          throw Errors.notFound('Job not found');
        }
        throw err;
      }
    }

    const outputUrls = (job.Model?.output_urls as Record<string, unknown>) ?? {};
    const progress = (outputUrls.progress as number) ?? 0;
    const outputUrl = (outputUrls.glb as string) ?? '';

    return {
      id: job.id,
      status: job.status,
      progress,
      errorMessage: job.error_message,
      modelId: job.model_id,
      outputUrl,
      previewUrl: job.Model?.preview_url ?? null,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    };
  },
};
