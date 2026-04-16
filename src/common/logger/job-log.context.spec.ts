import { jobLogFields } from './job-log.context';

describe('jobLogFields', () => {
  it('returns service, jobId, and merged extras for worker correlation', () => {
    expect(
      jobLogFields('job-uuid-1', { 'event.action': 'email_queued', invoiceId: 'inv-1' })
    ).toEqual({
      service: 'freelanceflow-api',
      jobId: 'job-uuid-1',
      'event.action': 'email_queued',
      invoiceId: 'inv-1',
    });
  });
});
