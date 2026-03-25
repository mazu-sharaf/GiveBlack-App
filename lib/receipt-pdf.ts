import * as Sharing from "expo-sharing";
import { Platform, Alert } from "react-native";
import { getApiUrl } from "@/lib/query-client";

interface ReceiptData {
  orgName: string;
  donorName: string;
  date: string;
  reference: string;
  amount: number;
  netToOrg: number;
  platformFee: number;
  orgAbsorbsFees: boolean;
  educationAmount: number;
  endowmentAmount: number;
}

function buildPdfUrl(data: ReceiptData): string {
  const params = new URLSearchParams({
    orgName: data.orgName,
    donorName: data.donorName,
    date: data.date,
    reference: data.reference,
    amount: String(data.amount),
    netToOrg: String(data.netToOrg),
    platformFee: String(data.platformFee),
    absorbedFees: String(data.orgAbsorbsFees),
    educationAmount: String(data.educationAmount),
    endowmentAmount: String(data.endowmentAmount),
  });

  const baseUrl = getApiUrl();
  return `${baseUrl}receipt-pdf?${params.toString()}`;
}

async function downloadPdfToLocal(data: ReceiptData): Promise<string> {
  const pdfUrl = buildPdfUrl(data);
  const fileName = `GiveBlack-Receipt-${data.reference}.pdf`;

  const FileSystem = await import("expo-file-system/legacy");
  const fileUri = (FileSystem.cacheDirectory || "") + fileName;
  const downloadResult = await FileSystem.downloadAsync(pdfUrl, fileUri);

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed with status ${downloadResult.status}`);
  }

  return downloadResult.uri;
}

export async function precacheReceipt(data: ReceiptData): Promise<string> {
  return downloadPdfToLocal(data);
}

async function getOrDownloadPdf(data: ReceiptData, cachedUri: string | null): Promise<string> {
  if (cachedUri) {
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const info = await FileSystem.getInfoAsync(cachedUri);
      if (info.exists) return cachedUri;
    } catch {}
  }
  return downloadPdfToLocal(data);
}

export async function downloadReceipt(data: ReceiptData, cachedUri?: string | null): Promise<void> {
  if (Platform.OS === "web") {
    const pdfUrl = buildPdfUrl(data);
    const fileName = `GiveBlack-Receipt-${data.reference}.pdf`;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const uri = await getOrDownloadPdf(data, cachedUri || null);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Save Receipt",
      UTI: "com.adobe.pdf",
    });
  } else {
    Alert.alert("Receipt Downloaded", "Your receipt has been saved.");
  }
}

export async function shareReceipt(data: ReceiptData, cachedUri?: string | null): Promise<void> {
  if (Platform.OS === "web") {
    const pdfUrl = buildPdfUrl(data);
    const fileName = `GiveBlack-Receipt-${data.reference}.pdf`;
    try {
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "GiveBlack Donation Receipt",
          text: `Donation receipt for ${data.orgName}`,
          files: [file],
        });
      } else if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "GiveBlack Donation Receipt",
          text: `Donation receipt for ${data.orgName} - $${data.amount.toFixed(2)}`,
          url: pdfUrl,
        });
      } else {
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = fileName;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = fileName;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
    return;
  }

  const uri = await getOrDownloadPdf(data, cachedUri || null);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Share GiveBlack Receipt",
      UTI: "com.adobe.pdf",
    });
  }
}
