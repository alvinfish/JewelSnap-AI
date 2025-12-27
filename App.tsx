
import React, { useState, useRef } from 'react';
import { ProcessingStatus, Keyframe, ProductBatch } from './types';
import { processVideo } from './services/videoProcessor';
import JSZip from 'jszip';
import { 
  SparklesIcon,
  FolderIcon,
  ArrowUpTrayIcon,
  CommandLineIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon,
  TrashIcon,
  XMarkIcon,
  PencilSquareIcon,
  Bars3Icon,
  PhotoIcon
} from '@heroicons/react/24/outline';

export default function App() {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<Keyframe | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newBatches: ProductBatch[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      fileName: file.name,
      productKey: file.name.split('.')[0],
      status: ProcessingStatus.QUEUED,
      progress: 0,
      frames: [],
      rawFile: file
    }));

    setBatches(prev => [...prev, ...newBatches]);
    if (!activeBatchId) setActiveBatchId(newBatches[0].id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const getStatusLabel = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.QUEUED: return '等待中';
      case ProcessingStatus.PROCESSING: return '处理中';
      case ProcessingStatus.COMPLETED: return '已完成';
      case ProcessingStatus.ERROR: return '错误';
      default: return '空闲';
    }
  };

  const startProcessing = async () => {
    const queued = batches.filter(b => b.status === ProcessingStatus.QUEUED);
    
    for (const batch of queued) {
      updateBatch(batch.id, { status: ProcessingStatus.PROCESSING });

      try {
        if (!batch.rawFile) throw new Error("Source file missing for " + batch.productKey);

        const { frames: extracted, metadata } = await processVideo(
          batch.rawFile, 
          (p) => updateBatch(batch.id, { progress: p })
        );

        const finalFrames = extracted.map((f) => ({
          ...f,
          label: `分段 ${f.partId} - 排名 ${f.rankId}`,
          aiDescription: "高清视频帧提取"
        }));

        updateBatch(batch.id, {
          status: ProcessingStatus.COMPLETED,
          frames: finalFrames,
          metadata
        });
      } catch (err) {
        console.error(err);
        updateBatch(batch.id, { status: ProcessingStatus.ERROR });
      }
    }
  };

  const updateBatch = (id: string, updates: Partial<ProductBatch>) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBatch = (id: string) => {
    setBatches(prev => prev.filter(b => b.id !== id));
    if (activeBatchId === id) setActiveBatchId(null);
  };

  const downloadZip = async (batch: ProductBatch) => {
    if (batch.status !== ProcessingStatus.COMPLETED) return;
    
    const zip = new JSZip();
    const folder = zip.folder(batch.productKey);
    const topFrames = batch.frames.filter(f => f.rankId === 1);
    
    topFrames.forEach((frame) => {
      const base64Data = frame.dataUrl.split(',')[1];
      const filename = `JS_${batch.metadata?.videoId}_${batch.metadata?.sessionTime}_P${frame.partId}_R${frame.rankId}.jpg`;
      folder?.file(filename, base64Data, { base64: true });
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${batch.productKey}_精选图.zip`;
    link.click();
  };

  const saveToGallery = async (batch: ProductBatch) => {
    if (batch.status !== ProcessingStatus.COMPLETED || isSharing) return;
    
    const topFrames = batch.frames.filter(f => f.rankId === 1);
    if (topFrames.length === 0) return;

    // 针对 iPhone/iOS 的优化方案：尝试使用 Web Share API
    // 这样在 iOS 上会弹出分享面板，用户可以选择“存储 5 张图像”，直接存入相册而非文件夹
    if (navigator.share && navigator.canShare) {
      try {
        setIsSharing(true);
        const files: File[] = await Promise.all(
          topFrames.map(async (frame, index) => {
            const res = await fetch(frame.dataUrl);
            const blob = await res.blob();
            return new File([blob], `${batch.productKey}_${index + 1}.jpg`, { type: 'image/jpeg' });
          })
        );

        if (navigator.canShare({ files })) {
          await navigator.share({
            files,
            title: '保存精选图',
            text: `来自 ${batch.productKey} 的精选抽帧`
          });
          setIsSharing(false);
          return;
        }
      } catch (err) {
        console.warn('Share API failed, falling back to traditional download', err);
      } finally {
        setIsSharing(false);
      }
    }

    // 兜底方案：传统下载逻辑 (在 PC 或 不支持 Share API 的安卓上运行)
    topFrames.forEach((frame, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = frame.dataUrl;
        link.download = `${batch.productKey}_高清帧_${index + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 300);
    });
  };

  const activeBatch = batches.find(b => b.id === activeBatchId);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">JewelSnap <span className="text-amber-500">V3.2</span></h1>
        </div>
        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
          <XMarkIcon className="w-6 h-6" />
        </button>
      </div>

      <div className="p-6 border-b border-slate-100">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          批量上传视频
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {batches.length === 0 && (
          <div className="text-center py-10 opacity-30 italic text-sm text-slate-400">
            队列中暂无视频
          </div>
        )}
        {batches.map(batch => (
          <button
            key={batch.id}
            onClick={() => {
              setActiveBatchId(batch.id);
              if (window.innerWidth < 768) setIsSidebarOpen(false);
            }}
            className={`w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between group ${
              activeBatchId === batch.id 
                ? 'bg-amber-50 border-amber-200 shadow-sm' 
                : 'bg-white border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <FolderIcon className={`w-5 h-5 shrink-0 ${activeBatchId === batch.id ? 'text-amber-500' : 'text-slate-400'}`} />
              <div className="truncate">
                <p className="text-sm font-bold truncate">{batch.productKey}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{getStatusLabel(batch.status)}</p>
              </div>
            </div>
            <ChevronRightIcon className={`w-4 h-4 transition-transform ${activeBatchId === batch.id ? 'translate-x-0' : 'opacity-0 -translate-x-2'}`} />
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-slate-100">
        <button 
          disabled={batches.every(b => b.status !== ProcessingStatus.QUEUED)}
          onClick={startProcessing}
          className="w-full py-3 bg-amber-500 disabled:bg-slate-200 text-white rounded-xl font-bold text-sm shadow-xl shadow-amber-100"
        >
          开始批量生图
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#FAFBFC] text-slate-900 font-sans selection:bg-amber-100 relative overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-80 border-r border-slate-200 bg-white flex-col">
        <SidebarContent />
      </aside>

      {/* Sidebar - Mobile Drawer */}
      <div 
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 md:hidden ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className={`fixed top-0 left-0 z-50 h-full w-80 bg-white transition-transform duration-300 transform md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <header className="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
            
            {activeBatch && (
              <div className="relative flex items-center group flex-1 max-w-md min-w-0">
                <PencilSquareIcon className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none group-focus-within:text-amber-500 hidden sm:block" />
                <input 
                  type="text"
                  value={activeBatch.productKey}
                  onChange={(e) => updateBatch(activeBatch.id, { productKey: e.target.value })}
                  className="bg-slate-50 border-none focus:ring-2 focus:ring-amber-500 rounded-lg px-3 sm:px-9 py-2 font-bold text-base md:text-xl w-full text-slate-900 truncate"
                  placeholder="产品名称"
                />
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 md:gap-6 shrink-0">
            {activeBatch && (
              <button 
                onClick={() => removeBatch(activeBatch.id)}
                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                title="删除该批次"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-8">
          {activeBatch ? (
            <>
              {activeBatch.status === ProcessingStatus.PROCESSING && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 md:w-20 h-16 md:h-20 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin mb-6"></div>
                  <h3 className="text-lg md:text-xl font-black mb-2">正在智能分析清晰度...</h3>
                  <p className="text-slate-500 max-w-sm px-4">
                    已启用 iOS 性能优化模式，正在为 {activeBatch.productKey} 深度扫描样本帧...
                  </p>
                  <div className="w-full max-w-xs h-2 bg-slate-100 rounded-full mt-8 overflow-hidden mx-auto">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${activeBatch.progress}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 italic">提示：120个高清样本分析通常需要 10-20 秒，请耐心等待</p>
                </div>
              )}

              {activeBatch.status === ProcessingStatus.COMPLETED && (
                <div className="space-y-8 md:space-y-12">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-8">
                    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                          <CheckBadgeIcon className="w-4 h-4 text-emerald-500" /> V3.2 最终精选 (Top 5)
                        </h4>
                        <div className="flex gap-2 w-full sm:w-auto">
                           <button 
                            onClick={() => saveToGallery(activeBatch)}
                            disabled={isSharing}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 ${isSharing ? 'bg-slate-200 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200'} text-slate-700 rounded-lg text-xs font-bold transition-colors`}
                          >
                            <PhotoIcon className={`w-3.5 h-3.5 ${isSharing ? 'animate-bounce' : ''}`} />
                            {isSharing ? '正在准备分享...' : '保存到相册'}
                          </button>
                          <button 
                            onClick={() => downloadZip(activeBatch)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-100"
                          >
                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                            打包下载 (.zip)
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3">
                        {activeBatch.frames.filter(f => f.rankId === 1).map((f) => (
                          <div 
                            key={f.id} 
                            onClick={() => setPreviewImage(f)}
                            className="aspect-square bg-slate-50 rounded-xl overflow-hidden border border-slate-100 group relative cursor-pointer"
                          >
                            <img src={f.dataUrl} className="w-full h-full object-cover" alt={f.label} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 md:group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <SparklesIcon className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-100">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                        <CommandLineIcon className="w-4 h-4 text-amber-500" /> 处理规格
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs gap-4"><span className="text-slate-500">产品标识:</span> <span className="font-mono truncate">{activeBatch.productKey}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">扫描深度:</span> <span className="font-mono">120 个样本</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">视频指纹:</span> <span className="font-mono">{activeBatch.metadata?.videoId}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-slate-500">优化状态:</span> <span className="font-mono text-emerald-500">低耗分析已开启</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 md:space-y-8">
                    <h3 className="text-base md:text-lg font-black flex items-center gap-2">
                      <Cog6ToothIcon className="w-5 h-5" /> 全量候选帧 (各段前三)
                    </h3>
                    
                    {[1, 2, 3, 4, 5].map(pId => (
                      <div key={pId} className="space-y-4">
                        <p className="text-[9px] font-black uppercase text-slate-300 tracking-[0.4em]">分段 {pId}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-6">
                          {activeBatch.frames.filter(f => f.partId === pId).map(frame => (
                            <div 
                              key={frame.id} 
                              onClick={() => setPreviewImage(frame)}
                              className="group bg-white rounded-xl md:rounded-2xl overflow-hidden border border-slate-100 hover:shadow-xl transition-all cursor-pointer"
                            >
                              <div className="aspect-square relative bg-slate-50">
                                <img src={frame.dataUrl} className="w-full h-full object-cover" alt={frame.label} />
                                <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] md:text-[10px] font-black text-white ${frame.rankId === 1 ? 'bg-amber-500' : 'bg-slate-400'}`}>
                                  排名 #{frame.rankId}
                                </div>
                              </div>
                              <div className="p-2 md:p-4">
                                <p className="text-[10px] md:text-xs font-bold truncate mb-1">{frame.label}</p>
                                <p className="text-[9px] md:text-[10px] text-slate-400 italic line-clamp-1">清晰度评分: {Math.round(frame.score)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeBatch.status === ProcessingStatus.QUEUED && (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                  <FolderIcon className="w-16 md:w-20 h-16 md:h-20 mb-4" />
                  <p className="font-bold text-slate-500">等待开始处理...</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 h-full text-center px-4">
              <div className="w-24 md:w-32 h-24 md:h-32 bg-slate-50 rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center mb-8 border border-slate-100">
                <SparklesIcon className="w-10 md:w-12 h-10 md:h-12" />
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-2">JewelSnap Pro V3.2</h2>
              <p className="text-slate-500 max-w-sm">请选择或批量上传视频以开始智能生图（120帧深度扫描）。</p>
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="mt-6 md:hidden px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm"
              >
                打开视频列表
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img 
              src={previewImage.dataUrl} 
              className="max-w-full max-h-full rounded-xl md:rounded-2xl shadow-2xl object-contain border border-white/10" 
              alt="Preview" 
            />
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute -top-2 md:-top-4 -right-2 md:-right-4 p-2 bg-white rounded-full text-black hover:bg-slate-100 transition-colors shadow-xl"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl text-white text-center w-[calc(100%-2rem)] max-w-sm">
              <p className="font-bold text-sm md:text-base">{previewImage.label}</p>
              <p className="text-[10px] md:text-xs opacity-70 italic truncate">清晰度评分: {Math.round(previewImage.score)}</p>
            </div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="video/*"
        multiple
        className="hidden"
      />

      {!isSidebarOpen && (
        <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 flex items-center gap-3 z-40">
          <div className="bg-white/90 backdrop-blur border border-slate-200 px-3 md:px-4 py-1.5 md:py-2 rounded-full shadow-lg flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${batches.some(b => b.status === ProcessingStatus.PROCESSING) ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-600">
              {batches.filter(b => b.status === ProcessingStatus.COMPLETED).length} / {batches.length} 已完成
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
