import { createAuditPipeline } from '../../src';
import { ConsoleRouter } from '../../src/integration/band-router';
import { BrevoProvider } from '../../src/integration/email-provider';
import { HttpWebhook } from '../../src/integration/pipeline-webhook';
import type { Handler } from '@netlify/functions';

const pipeline = createAuditPipeline({
  bandRouter: new ConsoleRouter(),
  emailProvider: process.env.EMAIL_API_KEY
    ? new BrevoProvider(process.env.EMAIL_API_KEY)
    : undefined,
  pipelineWebhook: process.env.PIPELINE_WEBHOOK_URL
    ? new HttpWebhook(process.env.PIPELINE_WEBHOOK_URL)
    : undefined,
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } as Record<string, string>,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const input = JSON.parse(event.body || '{}');
    const result = await pipeline.processSubmission(input);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Audit submission error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Scoring service is temporarily unavailable' }),
    };
  }
};
