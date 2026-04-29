const APP_URL = process.env.VITE_APP_URL || 'https://delivery-tracker-ashen.vercel.app'

interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
}

function infoRow(label: string, value: string | null | undefined): string {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:12px;color:#94a3b8;font-weight:500;display:inline-block;width:130px;vertical-align:top;">${label}</span>
        <span style="font-size:13px;color:#334155;font-weight:500;">${value}</span>
      </td>
    </tr>`
}

function footer(): string {
  return `
    <tr>
      <td style="padding:24px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;" align="center">
        <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.6;">
          You're receiving this because notifications are enabled for this project.
        </p>
        <p style="margin:0;font-size:12px;color:#cbd5e1;">
          Contact your Delivery Tracker admin to update notification preferences.
        </p>
        <p style="margin:12px 0 0;font-size:11px;color:#e2e8f0;">
          Delivery Tracker &nbsp;·&nbsp; ${APP_URL}
        </p>
      </td>
    </tr>`
}

function ctaButton(url: string, label: string, bgColor: string): string {
  return `<a href="${url}" style="display:inline-block;background:${bgColor};color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.3px;margin-top:4px;">${label} →</a>`
}

// ─── Template 1: Project Completed ───────────────────────────────────────────
export function buildCompletionEmail(to: string, project: any): EmailPayload {
  const rows = [
    infoRow('Country', project.country),
    infoRow('Project Type', project.project_type),
    infoRow('Date Received', project.date_received),
    infoRow('Completed', project.date_delivered || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
    infoRow('Days to Complete', project.days_to_complete != null ? `${project.days_to_complete} days` : null),
    infoRow('Analyst', project.analyst),
  ].join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Project Complete</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

          <!-- Green header -->
          <tr>
            <td style="background:linear-gradient(135deg,#047857 0%,#059669 40%,#10b981 100%);padding:40px 40px 36px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:12px 16px;margin-bottom:18px;font-size:28px;line-height:1;">🎉</div>
              <div style="color:#6ee7b7;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px;">Delivery Tracker</div>
              <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px;line-height:1.2;letter-spacing:-0.5px;">Your Project is Complete!</h1>
              <p style="color:#a7f3d0;font-size:15px;margin:0;line-height:1.6;">Great news — <strong style="color:#ffffff;">${project.client_name || 'Your project'}</strong> has been marked as Completed.</p>
            </td>
          </tr>

          <!-- Project info card -->
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                <div style="padding:16px 20px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
                  <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#16a34a;">Project Details</span>
                </div>
                <div style="padding:4px 20px 12px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${rows}
                  </table>
                </div>
              </div>
            </td>
          </tr>

          <!-- Delivery files callout -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:12px;padding:16px 20px;">
                <p style="margin:0 0 5px;font-size:13px;font-weight:700;color:#065f46;">📁 Delivery files may be ready</p>
                <p style="margin:0;font-size:13px;color:#059669;line-height:1.6;">Open the <strong>Delivery</strong> tab in your project to download completed files from your analyst.</p>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 40px 32px;" align="center">
              ${ctaButton(APP_URL, 'View Project', '#059669')}
            </td>
          </tr>

          ${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    to,
    subject: `✅ Project complete — ${project.client_name || 'Your project'}`,
    html,
  }
}

// ─── Template 2: Delivery File Ready ─────────────────────────────────────────
export function buildDeliveryFileEmail(to: string, project: any, files: any[]): EmailPayload {
  const fileRows = files.map(f => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;background:#fff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:#1e293b;font-weight:600;">
              📄 ${f.file_name || 'File'}
            </td>
            <td align="right" style="font-size:12px;color:#94a3b8;white-space:nowrap;">
              ${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ''}
            </td>
          </tr>
          ${f.description ? `<tr><td colspan="2" style="font-size:12px;color:#64748b;padding-top:3px;">${f.description}</td></tr>` : ''}
        </table>
      </td>
    </tr>`).join('')

  const rows = [
    infoRow('Client', project.client_name),
    infoRow('Country', project.country),
    infoRow('Project Type', project.project_type),
    infoRow('Analyst', project.analyst),
  ].join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Delivery Files Ready</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

          <!-- Indigo header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3730a3 0%,#4f46e5 40%,#6366f1 100%);padding:40px 40px 36px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:12px 16px;margin-bottom:18px;font-size:28px;line-height:1;">📦</div>
              <div style="color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px;">Delivery Tracker</div>
              <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px;line-height:1.2;letter-spacing:-0.5px;">Delivery Files Ready!</h1>
              <p style="color:#c7d2fe;font-size:15px;margin:0;line-height:1.6;">Your analyst has uploaded ${files.length === 1 ? 'a new file' : `${files.length} new files`} for <strong style="color:#ffffff;">${project.client_name || 'your project'}</strong>.</p>
            </td>
          </tr>

          <!-- File list -->
          ${files.length > 0 ? `
          <tr>
            <td style="padding:28px 40px 0;">
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                <div style="padding:14px 16px;background:#eef2ff;border-bottom:1px solid #e0e7ff;">
                  <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4f46e5;">New Files (${files.length})</span>
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${fileRows}
                </table>
              </div>
            </td>
          </tr>` : ''}

          <!-- Project info -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                <div style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Project</span>
                </div>
                <div style="padding:4px 20px 12px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${rows}
                  </table>
                </div>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 40px 32px;" align="center">
              ${ctaButton(APP_URL, 'Download Files', '#4f46e5')}
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Log in to Delivery Tracker and open the <strong>Delivery</strong> tab</p>
            </td>
          </tr>

          ${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    to,
    subject: `📦 Delivery files ready — ${project.client_name || 'Your project'}`,
    html,
  }
}

// ─── Template 3: Status Changed ──────────────────────────────────────────────
export function buildStatusChangeEmail(to: string, project: any, newStatus: string): EmailPayload {
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    'In Process': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    'On Hold':    { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
    'Completed':  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
    'Cancelled':  { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    'Pending':    { bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd' },
  }
  const sc = statusColors[newStatus] || { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' }

  const rows = [
    infoRow('Client', project.client_name),
    infoRow('Country', project.country),
    infoRow('Project Type', project.project_type),
    infoRow('Date Received', project.date_received),
    infoRow('Expected Delivery', project.expected_delivery_date),
  ].join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Project Status Updated</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:580px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

          <!-- Slate header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 50%,#475569 100%);padding:40px 40px 36px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);border-radius:14px;padding:12px 16px;margin-bottom:18px;font-size:28px;line-height:1;">🔄</div>
              <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:8px;">Delivery Tracker</div>
              <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px;line-height:1.2;letter-spacing:-0.5px;">Status Updated</h1>
              <p style="color:#cbd5e1;font-size:15px;margin:0;line-height:1.6;">Your project <strong style="color:#ffffff;">${project.client_name || ''}</strong> has a new status.</p>
            </td>
          </tr>

          <!-- Status badge -->
          <tr>
            <td style="padding:28px 40px 0;" align="center">
              <div style="display:inline-block;background:${sc.bg};border:2px solid ${sc.border};border-radius:100px;padding:10px 28px;">
                <span style="font-size:15px;font-weight:700;color:${sc.text};">${newStatus}</span>
              </div>
            </td>
          </tr>

          <!-- Project info -->
          <tr>
            <td style="padding:20px 40px 0;">
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;">
                <div style="padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Project Details</span>
                </div>
                <div style="padding:4px 20px 12px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${rows}
                  </table>
                </div>
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 40px 32px;" align="center">
              ${ctaButton(APP_URL, 'View Project', '#334155')}
            </td>
          </tr>

          ${footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    to,
    subject: `🔄 Status updated: ${newStatus} — ${project.client_name || 'Your project'}`,
    html,
  }
}
