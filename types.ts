
export interface Keyframe {
  id: string;
  dataUrl: string;
  processedUrl?: string; // Kept for interface compatibility but unused in logic
  timestamp: number;
  score: number;
  label?: string;
  aiDescription?: string;
  partId: number; // Segment 1-5
  rankId: number; // Rank 1-3
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface ProcessingMetadata {
  videoId: string;
  sessionTime: string;
}

export interface ProductBatch {
  id: string;
  fileName: string;
  productKey: string;
  status: ProcessingStatus;
  progress: number;
  frames: Keyframe[];
  metadata?: ProcessingMetadata;
  rawFile?: File; 
}

export interface AppConfig {
  squareSize: number;
  padding: number;
}
