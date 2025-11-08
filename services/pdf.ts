import { QrCodeInfo, QrCodeCustomization } from '../types';

// Augment the Window interface to include CDN libraries for TypeScript, making them globally available.
declare global {
  interface Window {
    pdfjsLib: any;
    ZXing: any;
    QRCode: any;
    jspdf: any;
  }
}


// Configure PDF.js worker
if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export const extractQrCodesFromPdf = async (file: File): Promise<QrCodeInfo[]> => {
  if (!window.pdfjsLib || !window.ZXing) {
    throw new Error('PDF processing libraries (pdf.js or ZXing) not loaded.');
  }
  
  const codeReader = new window.ZXing.BrowserQRCodeReader();
  const fileBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: fileBuffer }).promise;
  const numPages = pdf.numPages;
  const allQrCodes: QrCodeInfo[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create canvas context');
  }

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Use a moderate scale; ZXing is quite effective.
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Loop to find all QR codes on the page using ZXing's exception-based flow.
    while (true) {
      try {
        const result = codeReader.decodeFromCanvas(canvas);
        const resultPoints = result.getResultPoints();

        // Determine bounding box from result points for accurate cropping.
        const minX = Math.min(...resultPoints.map(p => p.getX()));
        const maxX = Math.max(...resultPoints.map(p => p.getX()));
        const minY = Math.min(...resultPoints.map(p => p.getY()));
        const maxY = Math.max(...resultPoints.map(p => p.getY()));
        
        const qrWidth = maxX - minX;
        const qrHeight = maxY - minY;

        const qrCanvas = document.createElement('canvas');
        qrCanvas.width = qrWidth;
        qrCanvas.height = qrHeight;
        const qrCtx = qrCanvas.getContext('2d');

        if (qrCtx) {
          qrCtx.drawImage(canvas, minX, minY, qrWidth, qrHeight, 0, 0, qrWidth, qrHeight);
          
          allQrCodes.push({
            id: `${i}-${minX}-${minY}`,
            data: result.getText(),
            imageDataUrl: qrCanvas.toDataURL(),
            // Scale location back down to original PDF point size
            location: { x: minX / scale, y: minY / scale, width: qrWidth / scale, height: qrHeight / scale },
            pageNumber: i,
            pageWidth: viewport.width / scale,
            pageHeight: viewport.height / scale,
          });
        }
        
        // Blank out the found QR code to allow finding subsequent codes on the same page.
        ctx.fillStyle = 'white';
        ctx.fillRect(minX, minY, qrWidth, qrHeight);

      } catch (err) {
        // ZXing throws NotFoundException when no more codes are found. This is our signal to stop scanning the current page.
        if (err instanceof window.ZXing.NotFoundException) {
          break;
        } else {
          // Log and break on other unexpected errors.
          console.error("An unexpected error occurred during QR code decoding:", err);
          break;
        }
      }
    }
  }
  return allQrCodes;
};

const generateQrCodeDataUrl = (url: string, customization: QrCodeCustomization, scale: number = 1): Promise<string> => {
    if (!window.QRCode) {
        throw new Error('QRCode generation library not loaded.');
    }
    return window.QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        width: customization.size * scale, // Render larger for better quality
        margin: 1,
        color: {
            dark: customization.color,
            light: customization.backgroundColor
        }
    });
}

export const replaceQrCodeInPdf = async (
  file: File,
  qrToReplace: QrCodeInfo,
  newUrl: string,
  customization: QrCodeCustomization
): Promise<string> => {
    if (!window.pdfjsLib || !window.jspdf) {
        throw new Error('PDF processing libraries (pdf.js or jspdf) not loaded.');
    }
    const fileBuffer = await file.arrayBuffer();
    const pdfDoc = await window.pdfjsLib.getDocument({ data: fileBuffer }).promise;
    const { jsPDF } = window.jspdf;
    const newPdf = new jsPDF({
        orientation: qrToReplace.pageWidth > qrToReplace.pageHeight ? 'l' : 'p',
        unit: 'pt',
        format: [qrToReplace.pageWidth, qrToReplace.pageHeight]
    });

    const newQrDataUrl = await generateQrCodeDataUrl(newUrl, customization, 2);

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        
        if (i > 1) {
          newPdf.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'l' : 'p');
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('Could not get canvas context');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (i === qrToReplace.pageNumber) {
            const newQrImg = new Image();
            await new Promise<void>((resolve, reject) => {
                newQrImg.onload = () => resolve();
                newQrImg.onerror = reject;
                newQrImg.src = newQrDataUrl;
            });

            ctx.drawImage(
                newQrImg,
                qrToReplace.location.x,
                qrToReplace.location.y,
                customization.size,
                customization.size
            );
        }

        const pageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        newPdf.addImage(pageDataUrl, 'JPEG', 0, 0, viewport.width, viewport.height);
    }

    return newPdf.output('bloburl');
};


export const generatePreviewPageAsDataUrl = async (
  file: File,
  qrToReplace: QrCodeInfo,
  newUrl: string,
  customization: QrCodeCustomization
): Promise<string> => {
    if (!window.pdfjsLib || !window.QRCode) {
        throw new Error('PDF processing libraries (pdf.js or QRCode) not loaded.');
    }
    const fileBuffer = await file.arrayBuffer();
    const pdfDoc = await window.pdfjsLib.getDocument({ data: fileBuffer }).promise;
    
    if (qrToReplace.pageNumber > pdfDoc.numPages) {
        throw new Error("Page number is out of bounds.");
    }
    
    const newQrDataUrl = await generateQrCodeDataUrl(newUrl, customization, 2);

    const page = await pdfDoc.getPage(qrToReplace.pageNumber);
    const viewport = page.getViewport({ scale: 1.5 }); // Higher res for preview
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const newQrImg = new Image();
    await new Promise<void>((resolve, reject) => {
        newQrImg.onload = () => resolve();
        newQrImg.onerror = reject;
        newQrImg.src = newQrDataUrl;
    });

    ctx.drawImage(
        newQrImg,
        qrToReplace.location.x * 1.5,
        qrToReplace.location.y * 1.5,
        customization.size * 1.5,
        customization.size * 1.5
    );

    return canvas.toDataURL('image/png');
};