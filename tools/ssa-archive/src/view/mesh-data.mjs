// Shared wire decoder for the browser and contract tests. Old servers may have no scenery field.
export function decodeMeshPayload(payload) {
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const decode = m => {
    const p = bytes(m.positions),
      ix = bytes(m.indices);
    return { ...m, positions: new Float32Array(p.buffer), indices: new Uint32Array(ix.buffer) };
  };
  return {
    models: new Map((payload.models ?? []).map(m => [m.model, decode(m)])),
    scenery: { ...payload.scenery, chunks: (payload.scenery?.chunks ?? []).map(decode) },
  };
}
