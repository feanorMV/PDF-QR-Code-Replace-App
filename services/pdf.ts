import { QrCodeInfo, QrCodeCustomization } from '../types';

// Declare global variables from CDN scripts for TypeScript
declare const pdfjsLib: any;
declare const jsQR: any;
declare const QRCode: any;
declare const jspdf: any;

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export const extractQrCodesFromPdf = async (file: File): Promise<QrCodeInfo[]> => {
  const fileBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
  const numPages = pdf.numPages;
  const qrCodes: QrCodeInfo[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Could not create canvas context');
  }

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // Higher scale for better detection
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      const { x, y, width, height } = code.location.topLeftCorner;
      const qrWidth = code.location.topRightCorner.x - x;
      const qrHeight = code.location.bottomLeftCorner.y - y;

      const qrCanvas = document.createElement('canvas');
      qrCanvas.width = qrWidth;
      qrCanvas.height = qrHeight;
      const qrCtx = qrCanvas.getContext('2d');
      if (qrCtx) {
        qrCtx.drawImage(canvas, x, y, qrWidth, qrHeight, 0, 0, qrWidth, qrHeight);
        
        qrCodes.push({
          id: `${i}-${x}-${y}`,
          data: code.data,
          imageDataUrl: qrCanvas.toDataURL(),
          location: { x: x / 2, y: y / 2, width: qrWidth / 2, height: qrHeight / 2 }, // Scale back down
          pageNumber: i,
          pageWidth: viewport.width / 2,
          pageHeight: viewport.height / 2,
        });
      }
    }
  }
  return qrCodes;
};

const generateQrCodeDataUrl = (url: string, customization: QrCodeCustomization, scale: number = 1): Promise<string> => {
    return QRCode.toDataURL(url, {
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
    const fileBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
    const { jsPDF } = jspdf;
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
    const fileBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
    
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
