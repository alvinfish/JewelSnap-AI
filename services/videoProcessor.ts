
import { Keyframe, ProcessingMetadata } from '../types';

/**
 * 在低分辨率下计算拉普拉斯方差以大幅提升移动端速度
 */
function calculateLaplacianVariance(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const grayscale = new Float32Array(width * height);

  // 灰度化处理
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let count = 0;
  const laplacian = new Float32Array(width * height);

  // 计算拉普拉斯算子
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const val = -4 * grayscale[idx] + 
                  grayscale[idx - 1] + 
                  grayscale[idx + 1] + 
                  grayscale[idx - width] + 
                  grayscale[idx + width];
      laplacian[idx] = val;
      sum += val;
      count++;
    }
  }

  const mean = sum / count;
  let varianceSum = 0;
  for (let i = 0; i < laplacian.length; i++) {
    if (laplacian[i] !== 0) { // 简单边缘过滤
      varianceSum += Math.pow(laplacian[i] - mean, 2);
    }
  }
  return varianceSum / count;
}

/**
 * 生成简单的视频指纹
 */
function generateVideoId(file: File): string {
  const str = file.name + file.size + file.lastModified;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).substring(0, 4).toUpperCase();
}

export async function processVideo(
  videoFile: File,
  onProgress: (percent: number) => void
): Promise<{ frames: Keyframe[]; metadata: ProcessingMetadata }> {
  const videoId = generateVideoId(videoFile);
  const now = new Date();
  const sessionTime = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(videoFile);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      
      // 高清提取画布 (用于最终输出)
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const captureCtx = captureCanvas.getContext('2d', { alpha: false });

      // 快速分析画布 (限制分辨率以提升分析速度，iPhone 性能优化的核心)
      const analysisCanvas = document.createElement('canvas');
      const analysisScale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      analysisCanvas.width = video.videoWidth * analysisScale;
      analysisCanvas.height = video.videoHeight * analysisScale;
      const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (!captureCtx || !analysisCtx) return reject('Canvas context unavailable');

      const segments = 5;
      const segmentDuration = duration / segments;
      const samplesPerSegment = 24; 
      const finalResults: Keyframe[] = [];

      for (let s = 0; s < segments; s++) {
        const segmentScores: { time: number; score: number }[] = [];

        // 第一阶段：快速扫描，仅计算得分，不生成 Base64 图片 (节省 90% 内存)
        for (let i = 0; i < samplesPerSegment; i++) {
          const totalSamples = segments * samplesPerSegment;
          const currentSample = (s * samplesPerSegment) + i;
          // 进度计算分两步，第一阶段占 80%
          onProgress(Math.floor((currentSample / totalSamples) * 80));

          const time = (s * segmentDuration) + (i * (segmentDuration / samplesPerSegment));
          video.currentTime = time;

          await new Promise((r) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              r(null);
            };
            video.addEventListener('seeked', onSeeked);
          });

          // 在小画布上绘图并分析
          analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
          const imageData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
          const score = calculateLaplacianVariance(imageData);

          segmentScores.push({ time, score });
        }

        // 筛选该段得分最高的前 3 名
        const top3Times = segmentScores
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        // 第二阶段：仅对该片段的 Top 3 进行高清截图
        for (let j = 0; j < top3Times.length; j++) {
          const { time, score } = top3Times[j];
          video.currentTime = time;
          await new Promise((r) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              r(null);
            };
            video.addEventListener('seeked', onSeeked);
          });

          captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
          
          finalResults.push({
            id: `p${s+1}_r${j+1}`,
            dataUrl: captureCanvas.toDataURL('image/jpeg', 0.9), // 0.9 质量足以满足电商需求且大幅减小体积
            timestamp: time,
            score: score,
            partId: s + 1,
            rankId: j + 1
          });
        }
      }

      onProgress(100);
      URL.revokeObjectURL(objectUrl);
      resolve({ 
        frames: finalResults, 
        metadata: { videoId, sessionTime } 
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject('Video processing error');
    };
  });
}
