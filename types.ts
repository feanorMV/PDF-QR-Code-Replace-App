export interface QrCodeLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QrCodeInfo {
  id: string;
  data: string;
  imageDataUrl: string;
  location: QrCodeLocation;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
}

export interface QrCodeCustomization {
    color: string;
    backgroundColor: string;
    size: number;
}

export interface ProcessedPdf {
    file: File;
    id: string;
    qrCodes: QrCodeInfo[];
}
