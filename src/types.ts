export type JobStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "exported";

export interface JobImage {
  filename: string;
  relativePath: string;
  prompt: string;
  mimeType: string;
  /** 可发布的 https 或 xhsfile URL；本地 mock 阶段可为空 */
  url?: string | null;
}

export interface JobReview {
  decision: "approved" | "rejected";
  note?: string;
  at: string;
}

export interface Job {
  id: string;
  topic: string;
  status: JobStatus;
  title: string;
  content: string;
  /** 话题，英文逗号分割 */
  tags: string;
  imagePrompts: string[];
  images: JobImage[];
  review?: JobReview;
  modelUsed?: string;
  fallbacksOffered?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CopyDraft {
  title: string;
  content: string;
  tags: string;
  imagePrompts: string[];
}

export interface FreeModel {
  id: string;
  name: string;
  pricing: {
    prompt: string | number | null;
    completion: string | number | null;
  };
  architecture: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoints?: string[];
  context_length?: number;
  isFree: true;
  isTextChat: boolean;
}

export interface ModelRoute {
  model: string;
  /** OpenRouter 官方 `models` 回退列表，全部为免费文本模型 */
  models: string[];
  candidates: string[];
}

export interface QuotaSnapshot {
  capturedAt: string;
  isFreeTier?: boolean;
  creditLimitRemaining?: number | null;
  freeModelDailyRequests?: {
    used: number;
    limit: number;
    remaining: number;
  } | null;
}

export interface PostNotePayload {
  title?: string;
  content?: string;
  /** JSON.stringify({ image_resources: [{ url }] }) */
  mediaInfo: string;
  /** 话题，英文逗号分割 */
  tags?: string;
}

export interface MediaInfo {
  image_resources: Array<{ url: string }>;
}
