import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { QrCodeInfo, ProcessedPdf, QrCodeCustomization } from './types';
import { extractQrCodesFromPdf, replaceQrCodeInPdf, generatePreviewPageAsDataUrl } from './services/pdf';
import Loader from './components/Loader';
import { UploadIcon, QrCodeIcon, DownloadIcon, LinkIcon, CheckCircleIcon, PaletteIcon, SettingsIcon, ExportIcon, ImportIcon } from './components/icons';
import PreviewModal from './components/PreviewModal';

const isPdfFile = async (file: File): Promise<boolean> => {
    // Quick check for extension and type first for performance
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
        return true;
    }

    // If quick checks fail, read the file header (magic number) for robust validation
    try {
        // Use the more modern and reliable blob.arrayBuffer()
        const buffer = await file.slice(0, 5).arrayBuffer();
        const arr = new Uint8Array(buffer);
        let header = "";
        for(let i = 0; i < arr.length; i++) {
           header += String.fromCharCode(arr[i]);
        }
        // Check for PDF magic number: %PDF-
        return header === "%PDF-";
    } catch (e) {
        console.error("Error reading file header:", e);
        return false;
    }
};


const App: React.FC = () => {
    const [processedPdfs, setProcessedPdfs] = useState<ProcessedPdf[]>([]);
    const [selectedQr, setSelectedQr] = useState<{ fileId: string; qrId: string } | null>(null);
    const [newUrl, setNewUrl] = useState<string>('');
    const [urlError, setUrlError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingText, setLoadingText] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [modifiedPdfUrl, setModifiedPdfUrl] = useState<string | null>(null);

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


    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            setError('Будь ласка, виберіть хоча б один PDF файл.');
            return;
        }

        resetState();
        setError(null);
        setIsLoading(true);
        setLoadingText(`Перевірка ${files.length} файлів...`);

        try {
            const fileList = Array.from(files);
            
            const filterResults = await Promise.all(fileList.map(isPdfFile));
            const pdfFiles = fileList.filter((_, index) => filterResults[index]);


            if (pdfFiles.length === 0) {
                setError('У вашому виборі не знайдено файлів PDF. Будь ласка, спробуйте ще раз.');
                setIsLoading(false);
                return;
            }
            
            setLoadingText(`Обробка ${pdfFiles.length} PDF файлів...`);

            const outcomes = await Promise.allSettled(
                pdfFiles.map(file => 
                    extractQrCodesFromPdf(file).then(qrCodes => ({ file, qrCodes, id: `${file.name}-${file.lastModified}` }))
                )
            );
            
            const successfulResults: ProcessedPdf[] = [];
            const failedFiles: File[] = [];

            outcomes.forEach((outcome, index) => {
                if (outcome.status === 'fulfilled') {
                    successfulResults.push(outcome.value);
                } else {
                    console.error(`Error processing ${pdfFiles[index].name}:`, outcome.reason);
                    failedFiles.push(pdfFiles[index]);
                }
            });

            if (successfulResults.length === 0) {
                setError('Не вдалося обробити жодного PDF файлу. Переконайтеся, що файли не пошкоджено.');
            } else {
                setProcessedPdfs(successfulResults);
                if (failedFiles.length > 0) {
                    setError(`Попередження: Не вдалося обробити ${failedFiles.length} файл(и).`);
                }
            }
        } catch (err) {
            console.error(err);
            setError('Сталася неочікувана помилка під час обробки файлів.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSelectQr = (fileId: string, qrId: string) => {
        setSelectedQr({ fileId, qrId });
        setModifiedPdfUrl(null); // Reset download link on new selection
    };

    const activeQrInfo = useMemo(() => {
        if (!selectedQr) return null;
        const pdf = processedPdfs.find(p => p.id === selectedQr.fileId);
        return pdf?.qrCodes.find(q => q.id === selectedQr.qrId) || null;
    }, [processedPdfs, selectedQr]);
    
    const activePdfFile = useMemo(() => {
        if (!selectedQr) return null;
        const pdf = processedPdfs.find(p => p.id === selectedQr.fileId);
        return pdf?.file || null;
    }, [processedPdfs, selectedQr]);


    useEffect(() => {
        if (activeQrInfo) {
            setCustomization(prev => ({ ...prev, size: Math.round(activeQrInfo.location.width) }));
        }
    }, [activeQrInfo]);
    

    const handlePreview = async () => {
        if (!activePdfFile || !activeQrInfo || !newUrl || urlError) return;
        
        setIsPreviewModalOpen(true);
        setPreviewImageUrl(null); // show loader in modal

        try {
            const url = await generatePreviewPageAsDataUrl(activePdfFile, activeQrInfo, newUrl, customization);
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
        if (!activePdfFile || !activeQrInfo || !newUrl) return;

        setIsReplacing(true);
        setLoadingText('Заміна QR-коду та створення нового PDF...');
        setError(null);
        setModifiedPdfUrl(null);

        try {
            const url = await replaceQrCodeInPdf(activePdfFile, activeQrInfo, newUrl, customization);
            setModifiedPdfUrl(url);
            const filename = `modified_${activePdfFile?.name || 'document.pdf'}`;
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
        setProcessedPdfs([]);
        setSelectedQr(null);
        setNewUrl('');
        setUrlError(null);
        setIsLoading(false);
        setError(null);
        setModifiedPdfUrl(null);
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
                // Basic validation
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
        // Reset file input
        event.target.value = '';
    };

    const renderFileUpload = () => (
        <div className="w-full max-w-lg">
            <label htmlFor="pdf-upload" className="flex flex-col items-center justify-center w-full h-64 bg-brand-surface border-2 border-brand-secondary border-dashed rounded-lg cursor-pointer hover:bg-brand-secondary transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadIcon className="w-10 h-10 mb-3 text-brand-text-dark" />
                    <p className="mb-2 text-sm text-brand-text-dark"><span className="font-semibold text-brand-primary">Натисніть, щоб завантажити</span> або перетягніть</p>
                    <p className="text-xs text-brand-text-dark">Один або кілька PDF файлів</p>
                </div>
                <input ref={fileInputRef} id="pdf-upload" type="file" className="hidden" accept=".pdf,application/pdf" multiple onChange={handleFileChange} />
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

    const renderContent = () => {
        if (isLoading) return <Loader text={loadingText} />;
        if (processedPdfs.length === 0 && !error) return renderFileUpload();

        if (processedPdfs.length === 0 && error) {
            return (
                 <div className="text-center">
                    <div className="w-full max-w-lg p-4 mb-4 text-center text-red-300 bg-red-900/50 border border-red-500 rounded-lg">{error}</div>
                    {renderFileUpload()}
                </div>
            )
        }


        return (
            <div className="w-full flex flex-col lg:flex-row gap-8">
                {/* Files & QR Codes List */}
                <div className="w-full lg:w-1/3 bg-brand-surface p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><QrCodeIcon /> Знайдені QR-коди</h2>
                    <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-2">
                        {processedPdfs.map(({ file, qrCodes, id: fileId }) => (
                            <details key={fileId} open={processedPdfs.length === 1} className="bg-black/20 rounded-lg">
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

                {/* Modification Panel */}
                <div className="w-full lg:w-2/3 bg-brand-surface p-6 rounded-lg shadow-lg">
                    {activeQrInfo ? (
                        <div>
                            <h2 className="text-xl font-bold mb-4">Замінити вибраний QR-код</h2>
                             <div className="mb-4 p-4 border border-brand-secondary rounded-lg bg-black/20">
                                <p className="text-sm text-brand-text-dark mb-1">Поточні дані:</p>
                                <p className="font-mono text-brand-primary break-all">{activeQrInfo.data}</p>
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

                            {modifiedPdfUrl && (
                                <div className="mt-8 p-4 bg-green-900/30 border border-green-500 rounded-lg text-center">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <CheckCircleIcon className="text-green-400" />
                                        <h3 className="text-lg font-semibold text-green-300">PDF успішно оновлено!</h3>
                                    </div>
                                     <p className="text-sm text-green-200 mb-3">Завантаження почалося автоматично.</p>
                                    <a href={modifiedPdfUrl} download={`modified_${activePdfFile?.name || 'document.pdf'}`}
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
                             {processedPdfs.some(p => p.qrCodes.length === 0) && <p className="mt-2 text-sm text-brand-text-dark/70">У деяких файлах не знайдено QR-кодів.</p>}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-brand-bg flex flex-col items-center p-4 sm:p-8">
             {isPreviewModalOpen && activeQrInfo && (
                <PreviewModal 
                    imageUrl={previewImageUrl}
                    onConfirm={handleConfirmReplace}
                    onCancel={() => setIsPreviewModalOpen(false)}
                    isProcessing={isReplacing}
                    qrLocation={activeQrInfo.location}
                    pageDimensions={{width: activeQrInfo.pageWidth, height: activeQrInfo.pageHeight}}
                />
             )}
            <header className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-brand-text-light">Заміна QR-кодів у PDF</h1>
                <p className="text-md text-brand-text-dark mt-2">Завантажте PDF, налаштуйте, перегляньте та замініть QR-коди.</p>
            </header>
            
            <main className="w-full max-w-7xl flex-grow flex flex-col items-center justify-center">
                {error && !isLoading && processedPdfs.length > 0 && <div className="w-full max-w-4xl p-3 mb-4 text-center text-yellow-300 bg-yellow-900/50 border border-yellow-500 rounded-lg">{error}</div>}
                {renderContent()}
            </main>
            
            {(processedPdfs.length > 0 || error) && (
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