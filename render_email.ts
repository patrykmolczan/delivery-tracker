import { buildCompletionEmail, buildDeliveryFileEmail } from './api/lib/emailTemplates';
import { writeFileSync } from 'fs';

const project = {
  id: 'abc123',
  project_name: 'Pay Intel — North America Compensation Study',
  id_number: 13891,
  requestor: 'Sarah Mitchell',
  analyst: 'Joanna Kowalski',
  date_received: '2024-01-08',
  date_delivered: '2024-01-22',
  client_type: 'Pay Intel (Rate Card)',
  countries: ['United States', 'Canada', 'United Kingdom'],
  status: 'Completed',
  days_to_complete: 14,
};

async function main() {
  const e1 = await buildCompletionEmail('patryk.molczan@magnitglobal.com', project);
  writeFileSync('/tmp/email_completed.html', e1.html);
  const e2 = await buildDeliveryFileEmail('patryk.molczan@magnitglobal.com', project, [
    { file_name: 'NA_Compensation_Study_Final.xlsx', uploaded_at: '2024-01-22T10:30:00Z' }
  ]);
  writeFileSync('/tmp/email_delivery.html', e2.html);
  console.log('OK');
}
main().catch(e => { console.error(e); process.exit(1); });
