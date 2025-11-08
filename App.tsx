import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { QrCodeInfo, ProcessedFile, QrCodeCustomization } from './types';
import { 
    extractQrCodesFromPdf, 
    replaceQrCodeInPdf, 
    generatePreviewPageAsDataUrl,
    extractQrCodesFromImage,
    replaceQrCodeInImage,
    generatePreviewImageAsDataUrl
} from './services/pdf';
import Loader from './components/Loader';
import { UploadIcon, QrCodeIcon, DownloadIcon, LinkIcon, CheckCircleIcon, PaletteIcon, SettingsIcon, ExportIcon, ImportIcon } from './components/icons';
import PreviewModal from './components/PreviewModal';

type AppStatus = 'initializing' | 'ready' | 'error';

const App: React.FC = () => {
    const [appStatus, setAppStatus] = useState<AppStatus>('initializing');
    const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
    const [selectedQr, setSelectedQr] = useState<{ fileId: string; qrId: string } | null>(null);
    const [newUrl, setNewUrl] = useState<string>('');
    const [urlError, setUrlError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingText, setLoadingText] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [modifiedFileUrl, setModifiedFileUrl] = useState<string | null>(null);

    const [customization, setCustomization] = useState<QrCodeCustomization>({
        color: '#000000',
        backgroundColor: '#FFFFFF',
        size: 100,
    });
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [isReplacing, setIsReplacing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const settingsFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const libs = ['pdfjsLib', 'ZXing', 'QRCode', 'jspdf'];
        let intervalId: number;
        const startTime = Date.now();
        const timeout = 10000; // 10 seconds

        const checkLibs = () => {
            const allLoaded = libs.every(lib => typeof (window as any)[lib] !== 'undefined');
            if (allLoaded) {
                // Configure worker once pdfjsLib is loaded
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
                setAppStatus('ready');
                clearInterval(intervalId);
            } else if (Date.now() - startTime > timeout) {
                setError('Не вдалося завантажити необхідні компоненти. Будь ласка, перевірте з\'єднання з Інтернетом, вимкніть блокувальники реклами та оновіть сторінку.');
                setAppStatus('error');
                clearInterval(intervalId);
            }
        };

        intervalId = window.setInterval(checkLibs, 100);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
    
        resetState();
        setIsLoading(true);
        const fileList = Array.from(files);
        setLoadingText(`Обробка ${fileList.length} файл(ів)...`);
    
        const processPromises = fileList.map(file => {
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            const isImage = file.type.startsWith('image/');
    
            if (isPdf) {
                return extractQrCodesFromPdf(file).then(qrCodes => ({ file, qrCodes, id: `${file.name}-${file.lastModified}` }));
            }
            if (isImage) {
                return extractQrCodesFromImage(file).then(qrCodes => ({ file, qrCodes, id: `${file.name}-${file.lastModified}` }));
            }
            return Promise.reject(new Error(`Непідтримуваний тип файлу: ${file.name}`));
        });
    
        const settledResults = await Promise.allSettled(processPromises);
    
        const successfulFiles: ProcessedFile[] = [];
        const failedFileMessages: string[] = [];
    
        settledResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successfulFiles.push(result.value);
            } else {
                console.error(`Failed to process ${fileList[index].name}:`, result.reason);
                failedFileMessages.push(`${fileList[index].name}: ${result.reason.message || 'Невідома помилка'}`);
            }
        });
    
        setProcessedFiles(successfulFiles);
    
        let currentError = '';
        if (failedFileMessages.length > 0) {
            currentError = `Не вдалося обробити деякі файли: ${failedFileMessages.join('; ')}. `;
        }
    
        if (successfulFiles.length === 0 && failedFileMessages.length > 0) {
            currentError = `Не вдалося обробити жодного з вибраних файлів. ${currentError}`;
        } else if (successfulFiles.length > 0 && successfulFiles.every(res => res.qrCodes.length === 0)) {
            currentError += "QR-кодів не знайдено в жодному з успішно оброблених файлів.";
        }
    
        setError(currentError.trim() || null);
        setIsLoading(false);
    }, []);

    const handleSelectQr = (fileId: string, qrId: string) => {
        setSelectedQr({ fileId, qrId });
        setModifiedFileUrl(null);
    };

    const activeFileInfo = useMemo(() => {
        if (!selectedQr) return null;
        const fileContainer = processedFiles.find(p => p.id === selectedQr.fileId);
        return fileContainer?.qrCodes.find(q => q.id === selectedQr.qrId) || null;
    }, [processedFiles, selectedQr]);
    
    const activeFile = useMemo(() => {
        if (!selectedQr) return null;
        const fileContainer = processedFiles.find(p => p.id === selectedQr.fileId);
        return fileContainer?.file || null;
    }, [processedFiles, selectedQr]);


    useEffect(() => {
        if (activeFileInfo) {
            setCustomization(prev => ({ ...prev, size: Math.round(activeFileInfo.location.width) }));
        }
    }, [activeFileInfo]);
    

    const handlePreview = async () => {
        if (!activeFile || !activeFileInfo || !newUrl || urlError) return;
        
        setIsPreviewModalOpen(true);
        setPreviewImageUrl(null);

        try {
            const isPdf = activeFile.type === 'application/pdf' || activeFile.name.toLowerCase().endsWith('.pdf');
            const url = isPdf
                ? await generatePreviewPageAsDataUrl(activeFile, activeFileInfo, newUrl, customization)
                : await generatePreviewImageAsDataUrl(activeFile, activeFileInfo, newUrl, customization);
            setPreviewImageUrl(url);
        } catch (err) {
            console.error(err);
            setError('Не вдалося створити попередній перегляд.');
            setIsPreviewModalOpen(false);
        }
    };
    
    const triggerDownload = (url: string, filename: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleConfirmReplace = async () => {
        if (!activeFile || !activeFileInfo || !newUrl) return;

        setIsReplacing(true);
        setLoadingText('Заміна QR-коду та створення нового файлу...');
        setError(null);
        setModifiedFileUrl(null);

        try {
            const isPdf = activeFile.type === 'application/pdf' || activeFile.name.toLowerCase().endsWith('.pdf');
            const url = isPdf
                ? await replaceQrCodeInPdf(activeFile, activeFileInfo, newUrl, customization)
                : await replaceQrCodeInImage(activeFile, activeFileInfo, newUrl, customization);
            
            setModifiedFileUrl(url);
            const extension = activeFile.name.split('.').pop() || 'file';
            const filename = `modified_${activeFile.name.replace(/\.[^/.]+$/, "")}.${extension}`;
            triggerDownload(url, filename);
        } catch (err) {
            console.error(err);
            setError('Не вдалося замінити QR-код. Спробуйте ще раз.');
        } finally {
            setIsReplacing(false);
            setIsPreviewModalOpen(false);
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const url = e.target.value;
        setNewUrl(url);
    
        if (url.trim() === '') {
            setUrlError('Посилання не може бути порожнім.');
            return;
        }
        
        let urlToCheck = url;
        if (!/^https?:\/\//i.test(urlToCheck)) {
            urlToCheck = 'https://' + urlToCheck;
        }
    
        try {
            const parsedUrl = new URL(urlToCheck);
            if (parsedUrl.hostname && parsedUrl.hostname.includes('.') && parsedUrl.hostname.split('.').pop()!.length > 1) {
                 setUrlError(null);
            } else {
                throw new Error('Invalid hostname');
            }
        } catch (_) {
            setUrlError('Будь ласка, введіть дійсне посилання.');
        }
    };


    const resetState = () => {
        setProcessedFiles([]);
        setSelectedQr(null);
        setNewUrl('');
        setUrlError(null);
        setIsLoading(false);
        setError(null);
        setModifiedFileUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleExportSettings = () => {
        const settingsStr = JSON.stringify(customization, null, 2);
        const blob = new Blob([settingsStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "qr-settings.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportSettings = () => {
        settingsFileInputRef.current?.click();
    };

    const handleSettingsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("File is not text");
                const settings = JSON.parse(text);
                if (settings.color && settings.backgroundColor && typeof settings.size === 'number') {
                    setCustomization(settings);
                } else {
                    setError("Невірний формат файлу налаштувань.");
                }
            } catch (err) {
                setError("Не вдалося прочитати файл налаштувань.");
                console.error(err);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const renderFileUpload = () => (
        <div className="w-full max-w-lg">
            <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-64 bg-brand-surface border-2 border-brand-secondary border-dashed rounded-lg cursor-pointer hover:bg-brand-secondary transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadIcon className="w-10 h-10 mb-3 text-brand-text-dark" />
                    <p className="mb-2 text-sm text-brand-text-dark"><span className="font-semibold text-brand-primary">Натисніть, щоб завантажити</span> або перетягніть</p>
                    <p className="text-xs text-brand-text-dark">PDF, JPG, або PNG файли</p>
                </div>
                <input ref={fileInputRef} id="file-upload" type="file" className="hidden" accept=".pdf,application/pdf,.jpg,.jpeg,.png,image/jpeg,image/png" multiple onChange={handleFileChange} />
            </label>
        </div>
    );

    const renderQrCustomization = () => (
        <div className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
                 <h3 className="text-lg font-semibold flex items-center gap-2"><SettingsIcon />Налаштування QR-коду</h3>
                 <div className="flex items-center gap-2">
                    <button onClick={handleImportSettings} title="Імпортувати налаштування" className="p-2 text-brand-text-dark hover:text-brand-primary transition-colors">
                        <ImportIcon />
                    </button>
                    <input type="file" ref={settingsFileInputRef} onChange={handleSettingsFileChange} accept=".json" className="hidden" />
                    <button onClick={handleExportSettings} title="Експортувати налаштування" className="p-2 text-brand-text-dark hover:text-brand-primary transition-colors">
                        <ExportIcon />
                    </button>
                 </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="qr-color" className="block text-sm font-medium text-brand-text-light mb-1">Колір</label>
                    <div className="flex items-center gap-2 p-2 bg-brand-bg border border-brand-secondary rounded-lg">
                        <input id="qr-color" type="color" value={customization.color} onChange={e => setCustomization({...customization, color: e.target.value})} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" style={{'WebkitAppearance': 'none', 'MozAppearance': 'none', 'appearance': 'none'}}/>
                        <span className="font-mono text-sm">{customization.color}</span>
                    </div>
                </div>
                <div>
                    <label htmlFor="qr-bg-color" className="block text-sm font-medium text-brand-text-light mb-1">Фон</label>
                    <div className="flex items-center gap-2 p-2 bg-brand-bg border border-brand-secondary rounded-lg">
                         <input id="qr-bg-color" type="color" value={customization.backgroundColor} onChange={e => setCustomization({...customization, backgroundColor: e.target.value})} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent" style={{'WebkitAppearance': 'none', 'MozAppearance': 'none', 'appearance': 'none'}}/>
                         <span className="font-mono text-sm">{customization.backgroundColor}</span>
                    </div>
                </div>
            </div>
            <div>
                 <label htmlFor="qr-size" className="block text-sm font-medium text-brand-text-light mb-1">Розмір (px)</label>
                 <div className="flex items-center gap-3">
                    <input id="qr-size" type="range" min="20" max="500" value={customization.size} onChange={e => setCustomization({...customization, size: parseInt(e.target.value, 10)})} className="w-full h-2 bg-brand-secondary rounded-lg appearance-none cursor-pointer"/>
                    <input type="number" value={customization.size} onChange={e => {
                        const newSize = parseInt(e.target.value, 10);
                        if (!isNaN(newSize) && newSize > 0) {
                            setCustomization({ ...customization, size: newSize });
                        }
                    }} className="w-20 bg-brand-bg border border-brand-secondary rounded-lg text-center" />
                 </div>
            </div>
        </div>
    );

    const renderMainContent = () => {
        if (isLoading) return <Loader text={loadingText} />;
        if (processedFiles.length === 0 && !error) return renderFileUpload();

        if (processedFiles.length === 0 && error && appStatus === 'ready') {
            return (
                 <div className="text-center">
                    <div className="w-full max-w-lg p-4 mb-4 text-center text-red-300 bg-red-900/50 border border-red-500 rounded-lg">{error}</div>
                    {renderFileUpload()}
                </div>
            )
        }

        return (
            <div className="w-full flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-1/3 bg-brand-surface p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><QrCodeIcon /> Знайдені QR-коди</h2>
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                        {processedFiles.map(({ file, qrCodes, id: fileId }) => (
                            <details key={fileId} open={processedFiles.length === 1} className="bg-black/20 rounded-lg">
                                <summary className="font-semibold p-3 cursor-pointer hover:bg-brand-secondary/50 rounded-t-lg">{file.name} ({qrCodes.length})</summary>
                                <div className="p-2 space-y-2">
                                    {qrCodes.map(qr => (
                                        <div key={qr.id} onClick={() => handleSelectQr(fileId, qr.id)}
                                            className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${selectedQr?.fileId === fileId && selectedQr?.qrId === qr.id ? 'border-brand-primary bg-blue-900/20' : 'border-brand-secondary hover:border-brand-primary/50'}`}>
                                            <div className="flex items-center gap-3">
                                                <img src={qr.imageDataUrl} alt="QR Code" className="w-12 h-12 rounded-md bg-white p-0.5" />
                                                <div className="truncate flex-1">
                                                    <p className="text-xs font-mono text-brand-text-dark truncate">{qr.data}</p>
                                                    <p className="text-xs text-brand-text-dark/70">Сторінка {qr.pageNumber}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                     {qrCodes.length === 0 && <p className="p-3 text-sm text-brand-text-dark">QR-кодів не знайдено.</p>}
                                </div>
                            </details>
                        ))}
                    </div>
                </div>

                <div className="w-full lg:w-2/3 bg-brand-surface p-6 rounded-lg shadow-lg">
                    {activeFileInfo ? (
                        <div>
                            <h2 className="text-xl font-bold mb-4">Замінити вибраний QR-код</h2>
                             <div className="mb-4 p-4 border border-brand-secondary rounded-lg bg-black/20">
                                <p className="text-sm text-brand-text-dark mb-1">Поточні дані:</p>
                                <p className="font-mono text-brand-primary break-all">{activeFileInfo.data}</p>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="new-url" className="block text-sm font-medium text-brand-text-light">Нове посилання для QR-коду</label>
                                    <div className="relative mt-1">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-text-dark" />
                                        <input id="new-url" type="text" value={newUrl} onChange={handleUrlChange} placeholder="https://example.com"
                                            className={`w-full pl-10 pr-4 py-2 bg-brand-bg border rounded-lg focus:ring-2 outline-none transition-all ${urlError ? 'border-red-500 focus:ring-red-500' : 'border-brand-secondary focus:ring-brand-primary focus:border-brand-primary'}`} />
                                    </div>
                                    {urlError && <p className="mt-1 text-xs text-red-400">{urlError}</p>}
                                </div>
                                
                                {renderQrCustomization()}
                                
                                <button onClick={handlePreview} disabled={!newUrl || !!urlError}
                                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-brand-primary text-white font-bold rounded-lg hover:bg-blue-500 disabled:bg-brand-secondary disabled:cursor-not-allowed transition-colors">
                                    <QrCodeIcon />
                                    Попередній перегляд
                                </button>
                            </div>

                            {modifiedFileUrl && (
                                <div className="mt-8 p-4 bg-green-900/30 border border-green-500 rounded-lg text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <CheckCircleIcon className="text-green-400" />
                                        <h3 className="text-lg font-semibold text-green-300">Файл успішно оновлено!</h3>
                                    </div>
                                     <p className="text-sm text-green-200 mb-3">Завантаження почалося автоматично.</p>
                                    <a href={modifiedFileUrl} download={`modified_${activeFile?.name || 'document.file'}`}
                                       className="inline-flex items-center justify-center gap-2 mt-2 px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition-colors">
                                        <DownloadIcon />
                                        Завантажити знову
                                    </a>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <QrCodeIcon className="w-16 h-16 text-brand-secondary" />
                            <p className="mt-4 text-lg text-brand-text-dark">Виберіть QR-код зі списку, щоб почати.</p>
                             {processedFiles.some(p => p.qrCodes.length === 0) && <p className="mt-2 text-sm text-brand-text-dark/70">У деяких файлах не знайдено QR-кодів.</p>}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderAppStatus = () => {
        switch (appStatus) {
            case 'initializing':
                return <Loader text="Ініціалізація компонентів..." />;
            case 'error':
                 // The main error display will show the message.
                return null;
            case 'ready':
                return renderMainContent();
            default:
                return null;
        }
    }

    return (
        <div className="min-h-screen bg-brand-bg flex flex-col items-center p-4 sm:p-8">
             {isPreviewModalOpen && activeFileInfo && (
                <PreviewModal 
                    imageUrl={previewImageUrl}
                    onConfirm={handleConfirmReplace}
                    onCancel={() => setIsPreviewModalOpen(false)}
                    isProcessing={isReplacing}
                    qrLocation={activeFileInfo.location}
                    pageDimensions={{width: activeFileInfo.pageWidth, height: activeFileInfo.pageHeight}}
                />
             )}
            <header className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-brand-text-light">Заміна QR-кодів у PDF та Зображеннях</h1>
                <p className="text-md text-brand-text-dark mt-2">Завантажте файли, налаштуйте, перегляньте та замініть QR-коди.</p>
            </header>
            
            <main className="w-full max-w-7xl flex-grow flex flex-col items-center justify-center">
                {error && <div className="w-full max-w-4xl p-3 mb-4 text-center text-yellow-300 bg-yellow-900/50 border border-yellow-500 rounded-lg">{error}</div>}
                {renderAppStatus()}
            </main>
            
            {(appStatus === 'ready' && (processedFiles.length > 0 || error)) && (
                 <button onClick={resetState} className="mt-8 text-sm text-brand-text-dark hover:text-brand-primary underline transition-colors">
                    Почати знову з новими файлами
                 </button>
            )}

            <footer className="text-center mt-12 text-xs text-brand-text-dark/50">
                <p>Створено з використанням React, Tailwind CSS та Gemini.</p>
            </footer>
        </div>
    );
};

export default App;