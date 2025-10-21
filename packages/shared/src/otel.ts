import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function startOtel(serviceName: string) {
  if (sdk) return;
  const exporter = new OTLPTraceExporter();
  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()]
  });
  try { void sdk.start(); } catch {}
}

export async function shutdownOtel() {
  if (sdk) {
    await sdk.shutdown().catch(() => {});
    sdk = null;
  }
}
