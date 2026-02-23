/** Phase 21: QR code generation for workshop join */

import QRCode from "qrcode";

/**
 * Generate a QR code as a data URI for the workshop join URL.
 * @param sessionCode 6-character session code
 * @returns Data URI string (image/svg+xml or image/png)
 */
export async function generateWorkshopQR(sessionCode: string): Promise<string> {
  const joinUrl = `/workshops/join?code=${encodeURIComponent(sessionCode)}`;
  return QRCode.toDataURL(joinUrl, {
    type: "image/png",
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}
