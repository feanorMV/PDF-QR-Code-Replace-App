import { QrCodeInfo, QrCodeCustomization } from '../types';

// Augment the Window interface to include CDN libraries for TypeScript, making them globally available.
declare global {
  interface Window {
    pdfjsLib: any;
    jsQR: any;
    QRCode: any;
    jspdf: any;
  }
}


// Configure PDF.js worker
if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export const extractQrCodesFromPdf = async (file: File): Promise<QrCodeInfo[]> => {
  if (!window.pdfjsLib || !window.jsQR) {
    throw new Error('PDF processing libraries (pdf.js or jsQR) not loaded.');
  }
  const fileBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: fileBuffer }).promise;
  const numPages = pdf.numPages;
  const allQrCodes: QrCodeInfo[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Could not create canvas context');
  }

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Increased scale for better accuracy with small or complex codes.
    const scale = 3.0;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // This imageData will be scanned repeatedly to find all QR codes.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Loop to find all QR codes on the page.
    while (true) {
      // Use default 'attemptBoth' for inversion for better robustness.
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        const { x, y } = code.location.topLeftCorner;
        const qrWidth = code.location.topRightCorner.x - x;
        const qrHeight = code.location.bottomLeftCorner.y - y;

        const qrCanvas = document.createElement('canvas');
        qrCanvas.width = qrWidth;
        qrCanvas.height = qrHeight;
        const qrCtx = qrCanvas.getContext('2d');

        if (qrCtx) {
          qrCtx.drawImage(canvas, x, y, qrWidth, qrHeight, 0, 0, qrWidth, qrHeight);
          
          allQrCodes.push({
            id: `${i}-${x}-${y}`,
            data: code.data,
            imageDataUrl: qrCanvas.toDataURL(),
            // Scale location back down to original PDF point size
            location: { x: x / scale, y: y / scale, width: qrWidth / scale, height: qrHeight / scale },
            pageNumber: i,
            pageWidth: viewport.width / scale,
            pageHeight: viewport.height / scale,
          });
        }
        
        // "White out" the found QR code in the imageData to prevent re-detection
        const {
            topLeftCorner,
            topRightCorner,
            bottomLeftCorner,
            bottomRightCorner,
        } = code.location;

        const padding = 10; // Add a small padding to ensure the whole code is covered
        const minX = Math.floor(Math.min(topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x)) - padding;
        const maxX = Math.ceil(Math.max(topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x)) + padding;
        const minY = Math.floor(Math.min(topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y)) - padding;
        const maxY = Math.ceil(Math.max(topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y)) + padding;

        for (let yPixel = minY; yPixel < maxY; yPixel++) {
            for (let xPixel = minX; xPixel < maxX; xPixel++) {
                if(xPixel < 0 || xPixel >= imageData.width || yPixel < 0 || yPixel >= imageData.height) continue;
                const pixelIndex = (yPixel * imageData.width + xPixel) * 4;
                // Set pixel to white to match typical background.
                imageData.data[pixelIndex] = 255;     // R
                imageData.data[pixelIndex + 1] = 255; // G
                imageData.data[pixelIndex + 2] = 255; // B
            }
        }
      } else {
        // No more QR codes found on this page, break the loop.
        break;
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