const APP_URL = process.env.VITE_APP_URL || 'https://delivery-tracker-ashen.vercel.app'

// ─── HTML escape (XSS defense) ───────────────────────────────────────────────
// All user-supplied values interpolated into email HTML must go through this.
function escapeHtml(val: string | null | undefined): string {
  if (val == null) return ''
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

async function getLogoUrl(): Promise<string> {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://slgtojndmckisjdplhcs.supabase.co'
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsZ3Rvam5kbWNraXNqZHBsaGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MTQ2NTIsImV4cCI6MjA5Mjk5MDY1Mn0.LeYQgQvz3WToE5zcbiETQYw5vJENu_DLFVxqd5jW-Vc'
    const res = await fetch(`${supabaseUrl}/rest/v1/app_settings?key=eq.logo_url&select=value`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    })
    const data = await res.json()
    return data?.[0]?.value ?? ''
  } catch {
    return ''
  }
}

interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BRAND   = '#0F172A'   // slate-900 — primary brand dark
const BLUE    = '#2563EB'   // blue-600 — enterprise action
const GREEN   = '#16A34A'   // green-600 — success / complete
const AMBER   = '#D97706'   // amber-600 — warning / on-hold
const RED     = '#DC2626'   // red-600 — cancelled
const PURPLE  = '#7C3AED'   // violet-600 — pending
const GREY    = '#64748B'   // slate-500 — secondary text
const BORDER  = '#E2E8F0'   // slate-200 — dividers / borders
const BG      = '#F1F5F9'   // slate-100 — email canvas
const CARD    = '#FFFFFF'   // white — card background

// ─── Shared HTML shell ────────────────────────────────────────────────────────
function shell(logoUrl: string, accentColor: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>Delivery Tracker</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
    <tr>
      <td align="center" style="padding:40px 16px 56px;">

        <!-- Email card — max 600px -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

          <!-- ① Brand accent stripe -->
          <tr>
            <td style="background-color:${accentColor};height:4px;border-radius:4px 4px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- ② Card body -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">

            <!-- Logo row -->
            <tr>
              <td style="padding:28px 40px 24px;border-bottom:1px solid ${BORDER};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td>
                      ${logoUrl
                        ? `<img src="${logoUrl}" alt="Company Logo" height="52" style="display:block;height:52px;width:auto;max-width:220px;object-fit:contain;" />`
                        : `<span style="font-size:13px;font-weight:700;letter-spacing:1px;color:${BRAND};text-transform:uppercase;">Delivery Tracker</span>`}
                    </td>
                    <td align="right">
                      <span style="font-size:11px;color:#94A3B8;font-weight:500;">Automated Notification</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Dynamic content slot -->
            ${content}

            <!-- Footer -->
            <tr>
              <td style="background-color:#F8FAFC;border-top:1px solid ${BORDER};padding:24px 40px;">
                <p style="margin:0 0 6px;font-size:12px;color:#94A3B8;line-height:1.6;">
                  You are receiving this notification because alerts are enabled for this project.
                  Contact your Delivery Tracker administrator to adjust notification preferences.
                </p>
                <p style="margin:8px 0 0;font-size:11px;color:#CBD5E1;">
                  Delivery Tracker &nbsp;&middot;&nbsp;
                  <a href="${APP_URL}" style="color:#CBD5E1;text-decoration:none;">${APP_URL.replace('https://', '')}</a>
                </p>
              </td>
            </tr>

          </table><!-- end card body -->

        </table><!-- end 600px card -->

      </td>
    </tr>
  </table><!-- end outer -->
</body>
</html>`
}

// ─── Detail row (two-col grid) ────────────────────────────────────────────────
function detailRow(label: string, value: string | null | undefined, last = false): string {
  if (!value) return ''
  return `
  <tr>
    <td width="160" valign="top" style="padding:11px 16px 11px 0;${last ? '' : `border-bottom:1px solid ${BORDER};`}">
      <span style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;">${label}</span>
    </td>
    <td valign="top" style="padding:11px 0;${last ? '' : `border-bottom:1px solid ${BORDER};`}">
      <span style="font-size:14px;color:${BRAND};font-weight:500;">${escapeHtml(value)}</span>
    </td>
  </tr>`
}

// ─── CTA button (full-width) ──────────────────────────────────────────────────
function ctaButton(url: string, label: string, color: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td align="center" style="padding:32px 40px 36px;">
        <a href="${url}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;mso-padding-alt:14px 40px;">${label}</a>
        <p style="margin:14px 0 0;font-size:12px;color:#94A3B8;">
          Or copy this link: <a href="${url}" style="color:${color};text-decoration:none;">${url}</a>
        </p>
      </td>
    </tr>
  </table>`
}

// ─── Status pill ──────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'In Process': { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  'On Hold':    { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  'Completed':  { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  'Cancelled':  { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
  'Pending':    { bg: '#FAF5FF', text: '#6D28D9', dot: '#8B5CF6' },
}
function statusPill(status: string): string {
  const s = STATUS_STYLES[status] || { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' }
  return `<span style="display:inline-flex;align-items:center;gap:6px;background-color:${s.bg};color:${s.text};font-size:13px;font-weight:600;padding:6px 16px;border-radius:100px;white-space:nowrap;">
    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:${s.dot};"></span>
    ${escapeHtml(status)}
  </span>`
}

// ─── Section heading ──────────────────────────────────────────────────────────
function sectionHeading(text: string): string {
  return `
  <tr>
    <td colspan="2" style="padding:0 0 4px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">${text}</span>
    </td>
  </tr>`
}

// ─── Timeline bar (for completed email) ───────────────────────────────────────
function timelineBar(dateReceived: string | null, dateDelivered: string | null, days: number | null): string {
  if (!dateReceived) return ''
  return `
  <tr>
    <td style="padding:24px 40px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid ${BORDER};">
            <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Project Timeline</span>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" width="33%">
                  <div style="width:10px;height:10px;border-radius:50%;background-color:${GREEN};margin:0 auto 8px;"></div>
                  <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Received</div>
                  <div style="font-size:13px;font-weight:600;color:${BRAND};">${dateReceived || '—'}</div>
                </td>
                <td align="center" width="33%">
                  <div style="font-size:11px;font-weight:700;color:${GREEN};background-color:#F0FDF4;border:1px solid #BBF7D0;padding:4px 12px;border-radius:100px;display:inline-block;">
                    ${days != null ? `${days} day${days !== 1 ? 's' : ''}` : 'Completed'}
                  </div>
                </td>
                <td align="center" width="33%">
                  <div style="width:10px;height:10px;border-radius:50%;background-color:${GREEN};margin:0 auto 8px;"></div>
                  <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Delivered</div>
                  <div style="font-size:13px;font-weight:600;color:${BRAND};">${dateDelivered || 'Today'}</div>
                </td>
              </tr>
              <tr>
                <td colspan="3" style="padding:0 24px;">
                  <div style="height:2px;background:linear-gradient(to right,${GREEN},${GREEN});border-radius:2px;margin:0;"></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}


// ═══════════════════════════════════════════════════════════════════════════════
// Template 1 — Project Completed
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildCompletionEmail(to: string, project: any): Promise<EmailPayload> {
  const logoUrl = await getLogoUrl()

  const content = `
    <!-- Hero -->
    <tr>
      <td style="padding:36px 40px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td>
              ${statusPill('Completed')}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 6px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${BRAND};line-height:1.3;letter-spacing:-0.3px;">
                Project Delivered
              </h1>
            </td>
          </tr>
          <tr>
            <td>
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.7;">
                Your project for <strong style="color:${BRAND};">${escapeHtml(project.client_name) || 'your organization'}</strong> has been completed and is ready for review.
                ${project.analyst ? `It was handled by <strong style="color:${BRAND};">${escapeHtml(project.analyst)}</strong>.` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="padding:0 40px;"><div style="height:1px;background-color:${BORDER};"></div></td></tr>

    <!-- Timeline bar -->
    ${timelineBar(project.date_received, project.date_delivered, project.days_to_complete)}

    <!-- Project details -->
    <tr>
      <td style="padding:24px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Project Details</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 20px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${detailRow('Client', project.client_name)}
                ${detailRow('Country', project.country)}
                ${detailRow('Project Type', project.project_type)}
                ${detailRow('Analyst', project.analyst)}
                ${detailRow('ID Number', project.id_number ? `#${project.id_number}` : null, true)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Delivery files callout -->
    <tr>
      <td style="padding:16px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="32" valign="top">
                    <div style="width:28px;height:28px;background-color:#DCFCE7;border-radius:6px;text-align:center;line-height:28px;font-size:14px;">&#128196;</div>
                  </td>
                  <td style="padding-left:12px;">
                    <p style="margin:0 0 3px;font-size:13px;font-weight:600;color:#15803D;">Delivery files available</p>
                    <p style="margin:0;font-size:13px;color:#166534;line-height:1.6;">Open the <strong>Delivery</strong> tab in your project to download completed files from your analyst.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    ${ctaButton(APP_URL, 'View Project', GREEN)}
  `

  return {
    to,
    subject: `Project complete — ${escapeHtml(project.client_name) || 'Your project'}`,
    html: shell(logoUrl, GREEN, content),
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Template 2 — Delivery File Ready
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildDeliveryFileEmail(to: string, project: any, files: any[]): Promise<EmailPayload> {
  const logoUrl = await getLogoUrl()

  const fileRows = files.map((f, i) => `
    <tr>
      <td style="padding:12px 20px;${i < files.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="32" valign="middle">
              <div style="width:28px;height:28px;background-color:#EEF2FF;border-radius:6px;text-align:center;line-height:28px;font-size:13px;">&#128196;</div>
            </td>
            <td style="padding-left:12px;" valign="middle">
              <div style="font-size:13px;font-weight:600;color:${BRAND};">${escapeHtml(f.file_name) || 'File'}</div>
              ${f.description ? `<div style="font-size:12px;color:${GREY};margin-top:2px;">${escapeHtml(f.description)}</div>` : ''}
            </td>
            <td align="right" valign="middle">
              <span style="font-size:12px;color:#94A3B8;white-space:nowrap;">${f.file_size ? Math.round(f.file_size / 1024) + ' KB' : ''}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('')

  const content = `
    <!-- Hero -->
    <tr>
      <td style="padding:36px 40px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td>
              <span style="display:inline-block;background-color:#EEF2FF;color:#4338CA;font-size:11px;font-weight:700;padding:5px 14px;border-radius:100px;text-transform:uppercase;letter-spacing:0.8px;">
                ${files.length} New ${files.length === 1 ? 'File' : 'Files'}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 6px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${BRAND};line-height:1.3;letter-spacing:-0.3px;">
                Delivery Files Ready
              </h1>
            </td>
          </tr>
          <tr>
            <td>
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.7;">
                ${files.length === 1 ? 'A new file has' : `${files.length} new files have`} been uploaded
                for <strong style="color:${BRAND};">${escapeHtml(project.client_name) || 'your project'}</strong>
                and ${files.length === 1 ? 'is' : 'are'} ready to download.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="padding:0 40px;"><div style="height:1px;background-color:${BORDER};"></div></td></tr>

    <!-- File list -->
    ${files.length > 0 ? `
    <tr>
      <td style="padding:24px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Attached Files</span>
            </td>
          </tr>
          ${fileRows}
        </table>
      </td>
    </tr>` : ''}

    <!-- Project details -->
    <tr>
      <td style="padding:16px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Project</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 20px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${detailRow('Client', project.client_name)}
                ${detailRow('Country', project.country)}
                ${detailRow('Project Type', project.project_type)}
                ${detailRow('Analyst', project.analyst, true)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Action note -->
    <tr>
      <td style="padding:16px 40px 0;">
        <p style="margin:0;font-size:13px;color:${GREY};line-height:1.7;">
          Log in to Delivery Tracker and open the <strong style="color:${BRAND};">Delivery</strong> tab on your project to download these files. Files are only accessible to authorized users.
        </p>
      </td>
    </tr>

    <!-- CTA -->
    ${ctaButton(APP_URL, 'Download Files', BLUE)}
  `

  return {
    to,
    subject: `Delivery files ready — ${escapeHtml(project.client_name) || 'Your project'} (${files.length} ${files.length === 1 ? 'file' : 'files'})`,
    html: shell(logoUrl, BLUE, content),
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Template 3 — Status Changed
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildStatusChangeEmail(to: string, project: any, newStatus: string): Promise<EmailPayload> {
  const logoUrl = await getLogoUrl()

  const accentMap: Record<string, string> = {
    'In Process': BLUE,
    'On Hold':    AMBER,
    'Completed':  GREEN,
    'Cancelled':  RED,
    'Pending':    PURPLE,
  }
  const accentColor = accentMap[newStatus] || BRAND

  const content = `
    <!-- Hero -->
    <tr>
      <td style="padding:36px 40px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td>
              <span style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Status Update</span>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${BRAND};line-height:1.3;letter-spacing:-0.3px;">
                Project Status Changed
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.7;">
                The status of <strong style="color:${BRAND};">${escapeHtml(project.client_name) || 'your project'}</strong> has been updated.
              </p>
            </td>
          </tr>
          <tr>
            <td>
              ${statusPill(newStatus)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="padding:0 40px;"><div style="height:1px;background-color:${BORDER};"></div></td></tr>

    <!-- Project details -->
    <tr>
      <td style="padding:24px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Project Details</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 20px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${detailRow('Client', project.client_name)}
                ${detailRow('Country', project.country)}
                ${detailRow('Project Type', project.project_type)}
                ${detailRow('Date Received', project.date_received)}
                ${detailRow('Expected Delivery', project.expected_delivery_date)}
                ${detailRow('Analyst', project.analyst, !project.id_number)}
                ${detailRow('ID Number', project.id_number ? `#${project.id_number}` : null, true)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Contextual note per status -->
    ${newStatus === 'On Hold' ? `
    <tr>
      <td style="padding:16px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;">
          <tr>
            <td style="padding:14px 20px;">
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">
                <strong>On Hold</strong> — Your project has been temporarily paused. You will be notified when work resumes. Contact your project owner if you have questions.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    ${newStatus === 'Cancelled' ? `
    <tr>
      <td style="padding:16px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FEF2F2;border:1px solid #FECACA;border-radius:10px;">
          <tr>
            <td style="padding:14px 20px;">
              <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6;">
                <strong>Cancelled</strong> — This project has been marked as cancelled. If this was unexpected, please contact your administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <!-- CTA -->
    ${ctaButton(APP_URL, 'View Project', accentColor)}
  `

  return {
    to,
    subject: `Status update: ${newStatus} — ${escapeHtml(project.client_name) || 'Your project'}`,
    html: shell(logoUrl, accentColor, content),
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Template 4 — ETA Changed (admin override notification)
// ═══════════════════════════════════════════════════════════════════════════════
export async function buildETAChangeEmail(
  to: string,
  project: any,
  oldDays: number | null,
  newDays: number,
  reason: string | null
): Promise<EmailPayload> {
  const logoUrl = await getLogoUrl()

  const changeDesc = oldDays
    ? `from <strong>${oldDays} business day${oldDays !== 1 ? 's' : ''}</strong> to <strong>${newDays} business day${newDays !== 1 ? 's' : ''}</strong>`
    : `to <strong>${newDays} business day${newDays !== 1 ? 's' : ''}</strong>`

  const content = `
    <!-- Hero -->
    <tr>
      <td style="padding:36px 40px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td>
              <span style="display:inline-block;background-color:#EEF2FF;color:#4338CA;font-size:11px;font-weight:700;padding:5px 14px;border-radius:100px;text-transform:uppercase;letter-spacing:0.8px;">
                ETA Updated
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 6px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${BRAND};line-height:1.3;letter-spacing:-0.3px;">
                Delivery Estimate Updated
              </h1>
            </td>
          </tr>
          <tr>
            <td>
              <p style="margin:0;font-size:14px;color:${GREY};line-height:1.7;">
                The estimated delivery time for <strong style="color:${BRAND};">${escapeHtml(project.client_name) || 'your project'}</strong>
                has been revised ${changeDesc}.
                ${reason ? `<br/><em style="color:${GREY};">Reason: ${escapeHtml(reason)}</em>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="padding:0 40px;"><div style="height:1px;background-color:${BORDER};"></div></td></tr>

    <!-- ETA highlight box -->
    <tr>
      <td style="padding:24px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Delivery Estimate</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${oldDays ? `
                  <td align="center" width="40%">
                    <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Previous</div>
                    <div style="font-size:22px;font-weight:700;color:#94A3B8;">${oldDays}<span style="font-size:13px;"> days</span></div>
                  </td>
                  <td align="center" width="20%">
                    <div style="font-size:20px;color:#94A3B8;">→</div>
                  </td>` : ''}
                  <td align="center" ${oldDays ? 'width="40%"' : 'width="100%"'}>
                    <div style="font-size:10px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">New Estimate</div>
                    <div style="font-size:28px;font-weight:800;color:${BLUE};">${newDays}<span style="font-size:14px;"> days</span></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Project details -->
    <tr>
      <td style="padding:16px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F8FAFC;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid ${BORDER};">
              <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94A3B8;">Project Details</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 20px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${detailRow('Client', project.client_name)}
                ${detailRow('Country', project.country)}
                ${detailRow('Project Type', project.project_type)}
                ${detailRow('Analyst', project.analyst, true)}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    ${ctaButton(APP_URL, 'View Project', BLUE)}
  `

  return {
    to,
    subject: `Delivery estimate updated — ${escapeHtml(project.client_name) || 'Your project'} (${newDays} business days)`,
    html: shell(logoUrl, BLUE, content),
  }
}
