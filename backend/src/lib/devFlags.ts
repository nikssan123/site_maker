/** When true, authenticated owners may download project ZIP without Stripe `paid` (local/testing only). */
export function allowUnpaidProjectDownload(): boolean {
  return process.env.ALLOW_UNPAID_PROJECT_DOWNLOAD === 'true';
}
