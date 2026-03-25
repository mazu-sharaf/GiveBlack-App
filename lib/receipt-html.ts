const LOGO_BASE64 = "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";

  export interface ReceiptData {
    donorName: string;
    orgName: string;
    dateStr: string;
    reference: string;
    totalCharged: number;
    orgAmount?: number;
    platformFee?: number;
    educationContribution?: number;
    endowmentContribution?: number;
    currency?: string;
  }

  export function buildReceiptHtml(params: ReceiptData): string {
    const logoImg = `<img src="data:image/png;base64,${LOGO_BASE64}" alt="GiveBlack" style="height:36px;"/>`;
    const logoImgWhite = `<img src="data:image/png;base64,${LOGO_BASE64}" alt="GiveBlack" style="height:32px;filter:brightness(0) invert(1);"/>`;

    const curr = params.currency?.toUpperCase() || "USD";
    const fmt = (v: number) =>
      v.toLocaleString("en-US", { style: "currency", currency: curr });

    const hasBreakdown =
      params.orgAmount != null && params.platformFee != null;

    let breakdownRows = "";
    if (hasBreakdown) {
      breakdownRows += `
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#4b5563;border-bottom:1px solid #f3f4f6;">Amount to ${params.orgName}</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#059669;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.orgAmount!)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#4b5563;border-bottom:1px solid #f3f4f6;">Platform Fee (3%)</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.platformFee!)}</td>
        </tr>`;
      if (params.educationContribution && params.educationContribution > 0) {
        breakdownRows += `
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#4b5563;border-bottom:1px solid #f3f4f6;">Education Reinvestment</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.educationContribution)}</td>
        </tr>`;
      }
      if (params.endowmentContribution && params.endowmentContribution > 0) {
        breakdownRows += `
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#4b5563;border-bottom:1px solid #f3f4f6;">Education Endowment</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.endowmentContribution)}</td>
        </tr>`;
      }
    }

    return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Poppins',sans-serif;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    @page{size:A4;margin:0;}
  </style>
  </head>
  <body>
  <div style="width:100%;max-width:595px;margin:0 auto;padding:0;">

    <div style="background:#059669;padding:32px 40px 28px;text-align:center;">
      <div style="margin-bottom:10px;">
        ${logoImgWhite}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase;font-weight:500;">
        Donation Receipt
      </div>
    </div>

    <div style="background:#f0fdf4;padding:28px 40px;text-align:center;border-bottom:1px solid #dcfce7;">
      <div style="font-size:42px;font-weight:800;color:#059669;letter-spacing:-1px;">
        ${fmt(params.totalCharged)}
      </div>
      <div style="font-size:13px;color:#6b7280;margin-top:6px;">
        Thank you for your generous contribution, ${params.donorName}
      </div>
    </div>

    <div style="padding:28px 40px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:12px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Donor</td>
          <td style="padding:12px 0;font-size:13px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #f3f4f6;">${params.donorName}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Organization</td>
          <td style="padding:12px 0;font-size:13px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #f3f4f6;">${params.orgName}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Date</td>
          <td style="padding:12px 0;font-size:13px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #f3f4f6;">${params.dateStr}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Reference</td>
          <td style="padding:12px 0;font-size:13px;font-weight:600;color:#111;text-align:right;border-bottom:1px solid #f3f4f6;font-family:monospace;letter-spacing:0.5px;">${params.reference}</td>
        </tr>
      </table>
    </div>

    ${hasBreakdown ? `
    <div style="padding:0 40px 28px;">
      <div style="background:#f9fafb;border-radius:10px;padding:18px 20px;border:1px solid #f3f4f6;">
        <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
          Donation Breakdown
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${breakdownRows}
        </table>
        <div style="margin-top:14px;padding-top:14px;border-top:2px solid #059669;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="font-size:14px;font-weight:700;color:#111;">Total Charged</td>
              <td style="font-size:20px;font-weight:800;color:#059669;text-align:right;">${fmt(params.totalCharged)}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
    ` : `
    <div style="padding:0 40px 28px;">
      <div style="background:#f9fafb;border-radius:10px;padding:18px 20px;border:1px solid #f3f4f6;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:14px;font-weight:700;color:#111;">Total</td>
            <td style="font-size:20px;font-weight:800;color:#059669;text-align:right;">${fmt(params.totalCharged)}</td>
          </tr>
        </table>
      </div>
    </div>
    `}

    <div style="text-align:center;padding:20px 40px 16px;">
      <div style="font-size:15px;font-weight:700;color:#111;">Thank You for Giving Black!</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">
        Your donation makes a meaningful difference in Black communities
      </div>
    </div>

    <div style="border-top:1px solid #e5e7eb;margin:16px 40px 0;padding:20px 0;text-align:center;">
      <div style="margin-bottom:6px;">
        ${logoImg}
      </div>
      <div style="font-size:10px;color:#9ca3af;line-height:1.6;">
        Simplifying giving, donating, and fundraising<br/>for Black organizations globally
      </div>
      <div style="font-size:10px;color:#059669;margin-top:6px;font-weight:500;">
        giveblackapp.com
      </div>
    </div>

  </div>
  </body>
  </html>`;
  }
  