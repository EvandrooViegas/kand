import {
  AutoProcessor,
  AutoModelForVision2Seq,
  RawImage,
  env,
} from "@huggingface/transformers";

import sharp from "sharp";

export interface AssetAnalysis {
  asset_type: string;
  description: string;
  tags: string[];
  objects: string[];
  environment: string | null;
  activity: string | null;
  style: string;
  has_people: boolean;
  people_description: string | null;
  dominant_subject: string;
  suitable_for: string[];
}

const MODEL_ID = "HuggingFaceTB/SmolVLM-256M-Instruct";

env.cacheDir = "./.cache/huggingface";

let processorPromise: Promise<any> | null = null;
let modelPromise: Promise<any> | null = null;

function getProcessor() {
  if (!processorPromise) {
    processorPromise = AutoProcessor.from_pretrained(MODEL_ID);
  }

  return processorPromise;
}

function getModel() {
  if (!modelPromise) {
    modelPromise = AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      dtype: {
        embed_tokens: "fp32",
        vision_encoder: "q4",
        decoder_model_merged: "q4",
      },
      device: "cpu",
    });
  }

  return modelPromise;
}

async function getVisionModel() {
  const start = Date.now();

  const [processor, model] = await Promise.all([
    getProcessor(),
    getModel(),
  ]);

  console.log(
    `[vision] Model ready in ${((Date.now() - start) / 1000).toFixed(1)}s`
  );

  return {
    processor,
    model,
  };
}

async function prepareImage(imageBuffer: Buffer): Promise<RawImage> {
  const resized = await sharp(imageBuffer)
    .rotate()
    .resize({
      width: 768,
      height: 768,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 82,
      chromaSubsampling: "4:2:0",
    })
    .toBuffer();

  const blob = new Blob([new Uint8Array(resized)], {
    type: "image/jpeg",
  });

  return RawImage.fromBlob(blob);
}

/**
 * Extract the first valid JSON object from the model output.
 */
function extractJson(text: string): Partial<AssetAnalysis> {
  let cleaned = text.trim();

  console.log("[vision] Model output:", cleaned);

  // Remove common chat prefixes.
  cleaned = cleaned
    .replace(/^assistant\s*:/i, "")
    .replace(/^answer\s*:/i, "")
    .trim();

  // Remove markdown fences.
  cleaned = cleaned
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // Find the first JSON object.
  const start = cleaned.indexOf("{");

  if (start === -1) {
    console.error("[vision] Model did not return JSON.");
    throw new Error("Vision model returned invalid JSON");
  }

  // Try every possible closing brace from the end.
  // This handles cases where the model adds extra text.
  for (let end = cleaned.length; end > start; end--) {
    if (cleaned[end - 1] !== "}") continue;

    const candidate = cleaned.slice(start, end);

    try {
      const parsed = JSON.parse(candidate);

      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Keep looking for a valid JSON object.
    }
  }

  console.error("[vision] Could not extract valid JSON:");
  console.error(cleaned);

  throw new Error("Vision model returned invalid JSON");
}

function normalizeAnalysis(
  data: Partial<AssetAnalysis>
): AssetAnalysis {
  return {
    asset_type:
      typeof data.asset_type === "string"
        ? data.asset_type
        : "photo",

    description:
      typeof data.description === "string"
        ? data.description
        : "",

    tags:
      Array.isArray(data.tags)
        ? data.tags
            .filter((x): x is string => typeof x === "string")
            .slice(0, 10)
        : [],

    objects:
      Array.isArray(data.objects)
        ? data.objects
            .filter((x): x is string => typeof x === "string")
            .slice(0, 10)
        : [],

    environment:
      typeof data.environment === "string"
        ? data.environment
        : null,

    activity:
      typeof data.activity === "string"
        ? data.activity
        : null,

    style:
      typeof data.style === "string"
        ? data.style
        : "photography",

    has_people:
      typeof data.has_people === "boolean"
        ? data.has_people
        : false,

    people_description:
      typeof data.people_description === "string"
        ? data.people_description
        : null,

    dominant_subject:
      typeof data.dominant_subject === "string"
        ? data.dominant_subject
        : "",

    suitable_for:
      Array.isArray(data.suitable_for)
        ? data.suitable_for
            .filter((x): x is string => typeof x === "string")
            .slice(0, 8)
        : [],
  };
}

export async function analyseImageBuffer(
  imageBuffer: Buffer,
  mimeType = "image/jpeg"
): Promise<AssetAnalysis> {
  const totalStart = Date.now();

  try {
    console.log("[vision] Preparing image...");

    const image = await prepareImage(imageBuffer);

    const { processor, model } = await getVisionModel();

    /**
     * IMPORTANT:
     *
     * The image is represented by { type: "image" } in the
     * conversation and supplied separately to the processor.
     */
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image",
          },
          {
            type: "text",
            text: `
Look at the image and analyze what is visibly present.

Return ONLY valid JSON. No markdown. No explanation.

Use exactly this structure:

{
  "asset_type": "",
  "description": "",
  "tags": [],
  "objects": [],
  "environment": null,
  "activity": null,
  "style": "",
  "has_people": false,
  "people_description": null,
  "dominant_subject": "",
  "suitable_for": []
}

Rules:
- Be factual and specific.
- Describe only visible things.
- Do not guess.
- If workers, helmets, reflective vests, concrete, rebar or unfinished structures are visible, identify it as a construction site.
- Use 5-8 relevant tags.
- Keep description to one sentence.
- has_people must be true only if people are visible.
- Return the actual image analysis, not the example above.
`,
          },
        ],
      },
    ];

    console.log("[vision] Processing image...");

    /**
     * Convert the conversation into the model's actual
     * multimodal prompt.
     */
    const prompt = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });

    /**
     * IMPORTANT:
     *
     * The image is passed separately here.
     * This is what connects the actual image to <image>
     * in the prompt.
     */
    const inputs = await processor(prompt, [image], {
      do_image_splitting: false,
    });

    console.log("[vision] Generating analysis...");

    const generatedIds = await model.generate({
      ...inputs,
      max_new_tokens: 120,
      do_sample: false,
    });

    /**
     * IMPORTANT FIX:
     *
     * generate() returns:
     *
     * [original prompt tokens + generated tokens]
     *
     * If we decode everything, we get:
     *
     * User:
     * Analyze...
     * Assistant:
     * {...}
     *
     * We only want the generated portion.
     */
    const inputLength = inputs.input_ids.dims.at(-1);

    const generatedOnly = generatedIds.slice(
      null,
      [inputLength, null]
    );

    const decoded = processor.batch_decode(generatedOnly, {
      skip_special_tokens: true,
    });

    const generatedText = decoded[0]?.trim() ?? "";

    if (!generatedText) {
      throw new Error("Vision model returned an empty response");
    }

    console.log("[vision] Raw response:", generatedText);

    const analysis = normalizeAnalysis(
      extractJson(generatedText)
    );

    console.log(
      `[vision] Analysis completed in ${(
        (Date.now() - totalStart) /
        1000
      ).toFixed(2)}s`
    );

    return analysis;
  } catch (error) {
    console.error("[vision] Analysis error:", error);
    throw error;
  }
}