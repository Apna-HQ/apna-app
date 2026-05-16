const APNA_PROTOCOL = 'apna/1';
const HANDSHAKE_INIT = 'handshake:init';

export function onIframeHandshake(
  iframe: HTMLIFrameElement,
  callback: () => void
): () => void {
  const handleMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (!isHandshakeInit(event.data)) return;
    callback();
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}

function isHandshakeInit(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const message = value as { protocol?: unknown; type?: unknown };
  return (
    message.protocol === APNA_PROTOCOL &&
    message.type === HANDSHAKE_INIT
  );
}
